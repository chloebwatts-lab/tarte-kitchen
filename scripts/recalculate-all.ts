/**
 * Recalculate every preparation batch cost and dish total cost from scratch.
 * Run this after updating gramsPerUnit values on COUNT ingredients, or any
 * time you suspect cached costs are stale.
 *
 * Usage:  npx tsx scripts/recalculate-all.ts
 */
import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"
import Decimal from "decimal.js"

const UNIT_MULT: Record<string, number> = {
  g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, oz: 28.3495, lb: 453.592,
}
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])

function calcIngredientLineCost(
  quantity: number,
  unit: string,
  purchasePrice: Decimal,
  baseUnitsPerPurchase: Decimal,
  wastePercentage: Decimal,
  baseUnitType: string,
  gramsPerUnit: Decimal | null
): Decimal {
  const wasteFactor = new Decimal(1).minus(wastePercentage.div(100))
  const usable = baseUnitsPerPurchase.mul(wasteFactor)
  if (usable.isZero()) return new Decimal(0)
  const cpbu = purchasePrice.div(usable)

  const u = unit.toLowerCase()
  if (baseUnitType === "COUNT" && WEIGHT_UNITS.has(u) && gramsPerUnit && !gramsPerUnit.isZero()) {
    const gramsInRecipe = new Decimal(quantity).mul(UNIT_MULT[u] ?? 1)
    const easUsed = gramsInRecipe.div(gramsPerUnit)
    return easUsed.mul(cpbu)
  }

  const baseQty = new Decimal(quantity).mul(UNIT_MULT[u] ?? 1)
  return baseQty.mul(cpbu)
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const db = new PrismaClient({ adapter })

  // ── 1. Recalculate all preparations ────────────────────────────────────
  const preps = await db.preparation.findMany({
    include: { items: { include: { ingredient: true, subPreparation: true } } },
  })

  console.log(`\n🍳  Recalculating ${preps.length} preparation(s)…`)

  for (const prep of preps) {
    let batchCost = new Decimal(0)

    for (const item of prep.items) {
      let lineCost = new Decimal(0)

      if (item.ingredient) {
        const ing = item.ingredient
        lineCost = calcIngredientLineCost(
          Number(item.quantity), item.unit,
          new Decimal(String(ing.purchasePrice)),
          new Decimal(String(ing.baseUnitsPerPurchase)),
          new Decimal(String(ing.wastePercentage)),
          ing.baseUnitType,
          ing.gramsPerUnit ? new Decimal(String(ing.gramsPerUnit)) : null
        ).toDecimalPlaces(4)
      } else if (item.subPreparation) {
        const sub = item.subPreparation
        const q = new Decimal(String(item.quantity))
        const batch = new Decimal(String(sub.batchCost))
        if (item.unit.toLowerCase() === "serve") {
          const yieldQty = new Decimal(String(sub.yieldQuantity))
          lineCost = yieldQty.gt(0) ? q.div(yieldQty).mul(batch).toDecimalPlaces(4) : new Decimal(0)
        } else {
          const baseQty = q.mul(UNIT_MULT[item.unit.toLowerCase()] ?? 1)
          const yieldGrams = new Decimal(String(sub.yieldWeightGrams))
          lineCost = yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(batch).toDecimalPlaces(4) : new Decimal(0)
        }
      }

      batchCost = batchCost.plus(lineCost)
      await db.preparationItem.update({ where: { id: item.id }, data: { lineCost: Number(lineCost) } })
    }

    const yieldGrams = new Decimal(String(prep.yieldWeightGrams))
    const yieldQty = new Decimal(String(prep.yieldQuantity))
    const costPerGram = yieldGrams.gt(0) ? batchCost.div(yieldGrams) : new Decimal(0)
    const costPerServe = yieldQty.gt(0) ? batchCost.div(yieldQty) : new Decimal(0)

    await db.preparation.update({
      where: { id: prep.id },
      data: {
        batchCost: Number(batchCost.toDecimalPlaces(2)),
        costPerGram: Number(costPerGram.toDecimalPlaces(4)),
        costPerServe: Number(costPerServe.toDecimalPlaces(2)),
      },
    })
    console.log(`  ✅  ${prep.name}  →  batch $${batchCost.toFixed(2)}`)
  }

  // Need fresh prep data (batchCost just updated) for dish calculation
  const freshPreps = await db.preparation.findMany({ select: { id: true, batchCost: true, yieldQuantity: true, yieldWeightGrams: true } })
  const prepMap = new Map(freshPreps.map((p) => [p.id, p]))

  // ── 2. Recalculate all dishes ───────────────────────────────────────────
  const dishes = await db.dish.findMany({
    include: { components: { include: { ingredient: true, preparation: true } } },
  })

  console.log(`\n🍽️   Recalculating ${dishes.length} dish(es)…`)

  for (const dish of dishes) {
    let totalCost = new Decimal(0)

    for (const comp of dish.components) {
      let lineCost = new Decimal(0)

      if (comp.ingredient) {
        const ing = comp.ingredient
        lineCost = calcIngredientLineCost(
          Number(comp.quantity), comp.unit,
          new Decimal(String(ing.purchasePrice)),
          new Decimal(String(ing.baseUnitsPerPurchase)),
          new Decimal(String(ing.wastePercentage)),
          ing.baseUnitType,
          ing.gramsPerUnit ? new Decimal(String(ing.gramsPerUnit)) : null
        ).toDecimalPlaces(4)
      } else if (comp.preparation) {
        const prep = prepMap.get(comp.preparationId!)
        if (prep) {
          const q = new Decimal(String(comp.quantity))
          const batch = new Decimal(String(prep.batchCost))
          if (comp.unit.toLowerCase() === "serve") {
            const yieldQty = new Decimal(String(prep.yieldQuantity))
            lineCost = yieldQty.gt(0) ? q.div(yieldQty).mul(batch).toDecimalPlaces(4) : new Decimal(0)
          } else {
            const baseQty = q.mul(UNIT_MULT[comp.unit.toLowerCase()] ?? 1)
            const yieldGrams = new Decimal(String(prep.yieldWeightGrams))
            lineCost = yieldGrams.gt(0) ? baseQty.div(yieldGrams).mul(batch).toDecimalPlaces(4) : new Decimal(0)
          }
        }
      }

      totalCost = totalCost.plus(lineCost)
      await db.dishComponent.update({ where: { id: comp.id }, data: { lineCost: Number(lineCost) } })
    }

    const sellingPriceExGst = new Decimal(String(dish.sellingPrice)).div(1.1)
    const fcPct = sellingPriceExGst.gt(0) ? totalCost.div(sellingPriceExGst).mul(100) : new Decimal(0)
    const gp = sellingPriceExGst.minus(totalCost)

    await db.dish.update({
      where: { id: dish.id },
      data: {
        totalCost: Number(totalCost.toDecimalPlaces(2)),
        foodCostPercentage: Number(fcPct.toDecimalPlaces(1)),
        grossProfit: Number(gp.toDecimalPlaces(2)),
      },
    })
    console.log(`  ✅  ${dish.name}  →  cost $${totalCost.toFixed(2)}  (${fcPct.toFixed(1)}%)`)
  }

  console.log("\n🎉  Done — all costs recalculated.\n")

  await db.$disconnect()
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
