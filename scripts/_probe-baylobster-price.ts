import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import { Decimal } from "../src/generated/prisma/internal/prismaNamespace"
import { costPerBaseUnit, ingredientLineCost, preparationLineCost, exGst, foodCostPercentage } from "../src/lib/units"

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const db = new PrismaClient({ adapter: new PrismaPg(pool) })

const NEW_PRICE_PER_KG = 119

async function main() {
  const ings = await db.ingredient.findMany({
    where: { name: { contains: "lobster", mode: "insensitive" } },
    select: { id: true, name: true, baseUnitType: true, purchaseQuantity: true, purchaseUnit: true, purchasePrice: true, baseUnitsPerPurchase: true, wastePercentage: true, gramsPerUnit: true, supplier: { select: { name: true } } },
  })
  if (!ings.length) { console.log("No lobster ingredient found"); return }

  for (const ing of ings) {
    console.log(`\n=== ${ing.name}  [${ing.supplier?.name ?? "no supplier"}]`)
    console.log(`  purchase: ${ing.purchaseQuantity} ${ing.purchaseUnit} @ $${ing.purchasePrice}  | base units/purchase: ${ing.baseUnitsPerPurchase} | waste ${ing.wastePercentage}%`)
    const curInfo = { purchasePrice: ing.purchasePrice as any, baseUnitsPerPurchase: ing.baseUnitsPerPurchase as any, wastePercentage: ing.wastePercentage as any, baseUnitType: ing.baseUnitType as any, gramsPerUnit: ing.gramsPerUnit as any }
    const curCPU = costPerBaseUnit(curInfo)

    // Derive new purchasePrice for the same purchase pack at $119/kg.
    // baseUnitsPerPurchase is grams for WEIGHT. price scales with $/kg = $/1000g.
    const newPurchasePrice = new Decimal(ing.baseUnitsPerPurchase as any).div(1000).mul(NEW_PRICE_PER_KG)
    const newInfo = { ...curInfo, purchasePrice: newPurchasePrice }
    const newCPU = costPerBaseUnit(newInfo)

    const curPerKg = new Decimal(ing.purchasePrice as any).div(new Decimal(ing.baseUnitsPerPurchase as any).div(1000))
    console.log(`  CURRENT: $${curPerKg.toFixed(2)}/kg purchase -> usable $${curCPU.mul(1000).toFixed(2)}/kg ($${curCPU.toFixed(5)}/g)`)
    console.log(`  NEW:     $${NEW_PRICE_PER_KG.toFixed(2)}/kg purchase -> usable $${newCPU.mul(1000).toFixed(2)}/kg ($${newCPU.toFixed(5)}/g)  [new pack price $${newPurchasePrice.toFixed(2)}]`)
    const deltaPerKg = curPerKg.minus(NEW_PRICE_PER_KG)
    console.log(`  change: ${deltaPerKg.gte(0) ? "-" : "+"}$${deltaPerKg.abs().toFixed(2)}/kg (${deltaPerKg.div(curPerKg).mul(100).toFixed(1)}%)`)

    // Find preparations using this ingredient
    const prepItems = await db.preparationItem.findMany({
      where: { ingredientId: ing.id },
      select: { quantity: true, unit: true, lineCost: true, preparation: { select: { id: true, name: true, batchCost: true, yieldWeightGrams: true, costPerGram: true } } },
    })
    // Find dishes using this ingredient directly
    const dishComps = await db.dishComponent.findMany({
      where: { ingredientId: ing.id },
      select: { quantity: true, unit: true, lineCost: true, dish: { select: { id: true, name: true, venue: true, sellingPrice: true, totalCost: true, foodCostPercentage: true, grossProfit: true } } },
    })

    console.log(`\n  -- used in ${prepItems.length} preparation(s), ${dishComps.length} dish component(s) directly --`)

    for (const pi of prepItems) {
      const oldLine = ingredientLineCost(pi.quantity as any, pi.unit, curInfo)
      const newLine = ingredientLineCost(pi.quantity as any, pi.unit, newInfo)
      console.log(`\n  PREP: ${pi.preparation.name}`)
      console.log(`    uses ${pi.quantity} ${pi.unit}: line $${oldLine.toFixed(2)} -> $${newLine.toFixed(2)} (stored $${pi.lineCost})`)
      const oldBatch = new Decimal(pi.preparation.batchCost as any)
      const newBatch = oldBatch.minus(oldLine).plus(newLine)
      const yieldG = new Decimal(pi.preparation.yieldWeightGrams as any)
      console.log(`    batch: $${oldBatch.toFixed(2)} -> $${newBatch.toFixed(2)}  | perGram $${oldBatch.div(yieldG).toFixed(5)} -> $${newBatch.div(yieldG).toFixed(5)}`)

      // dishes using this prep
      const usedInDishes = await db.dishComponent.findMany({
        where: { preparationId: pi.preparation.id },
        select: { quantity: true, unit: true, lineCost: true, dish: { select: { name: true, venue: true, sellingPrice: true, totalCost: true, foodCostPercentage: true, grossProfit: true } } },
      })
      for (const dc of usedInDishes) {
        const prepMeta = { batchCost: newBatch, yieldWeightGrams: yieldG, costPerGram: newBatch.div(yieldG), yieldQuantity: new Decimal(1), yieldUnit: "g" } as any
        const prepMetaOld = { batchCost: oldBatch, yieldWeightGrams: yieldG, costPerGram: oldBatch.div(yieldG), yieldQuantity: new Decimal(1), yieldUnit: "g" } as any
        const newDishLine = preparationLineCost(dc.quantity as any, dc.unit, prepMeta)
        const oldDishLine = preparationLineCost(dc.quantity as any, dc.unit, prepMetaOld)
        const oldTotal = new Decimal(dc.dish.totalCost as any)
        const newTotal = oldTotal.minus(oldDishLine).plus(newDishLine)
        const exg = exGst(dc.dish.sellingPrice as any)
        const newFC = foodCostPercentage(newTotal, dc.dish.sellingPrice as any)
        console.log(`      DISH: ${dc.dish.name} [${dc.dish.venue}] sell $${dc.dish.sellingPrice}`)
        console.log(`        cost $${oldTotal.toFixed(2)} -> $${newTotal.toFixed(2)} | FC ${new Decimal(dc.dish.foodCostPercentage as any).toFixed(1)}% -> ${newFC.toFixed(1)}% | GP $${exg.minus(newTotal).toFixed(2)}`)
      }
    }

    for (const dc of dishComps) {
      const oldLine = ingredientLineCost(dc.quantity as any, dc.unit, curInfo)
      const newLine = ingredientLineCost(dc.quantity as any, dc.unit, newInfo)
      const oldTotal = new Decimal(dc.dish.totalCost as any)
      const newTotal = oldTotal.minus(oldLine).plus(newLine)
      const exg = exGst(dc.dish.sellingPrice as any)
      const newFC = foodCostPercentage(newTotal, dc.dish.sellingPrice as any)
      console.log(`\n  DISH (direct): ${dc.dish.name} [${dc.dish.venue}] sell $${dc.dish.sellingPrice}`)
      console.log(`    uses ${dc.quantity} ${dc.unit}: line $${oldLine.toFixed(2)} -> $${newLine.toFixed(2)}`)
      console.log(`    cost $${oldTotal.toFixed(2)} -> $${newTotal.toFixed(2)} | FC ${new Decimal(dc.dish.foodCostPercentage as any).toFixed(1)}% -> ${newFC.toFixed(1)}% | GP $${exg.minus(newTotal).toFixed(2)}`)
    }
  }

  await db.$disconnect(); await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
