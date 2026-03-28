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
const VOLUME_UNITS = new Set(["ml", "l", "cl"])
const COUNT_UNITS = new Set(["ea", "dozen", "serve"])

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
  // COUNT ingredient used by WEIGHT or VOLUME in recipe (e.g. 20g cos lettuce, 30ml BBQ sauce)
  if (baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && gramsPerUnit && !gramsPerUnit.isZero()) {
    const baseInRecipe = new Decimal(quantity).mul(UNIT_MULT[u] ?? 1)
    const unitsUsed = baseInRecipe.div(gramsPerUnit)
    return unitsUsed.mul(cpbu)
  }

  const baseQty = new Decimal(quantity).mul(UNIT_MULT[u] ?? 1)
  return baseQty.mul(cpbu)
}

function calcPrepLineCost(
  quantity: number,
  unit: string,
  batchCost: Decimal,
  yieldQuantity: Decimal,
  yieldUnit: string,
  yieldWeightGrams: Decimal
): Decimal {
  const q = new Decimal(quantity)
  const u = unit.toLowerCase()
  const yu = yieldUnit.toLowerCase()

  // COUNT → COUNT: "1 ea" from "70 ea" batch, or "2 serve" from "180 serve" batch
  const unitIsCount = COUNT_UNITS.has(u)
  const yieldIsCount = yu === "serve" || yu === "ea"
  if (unitIsCount && yieldIsCount) {
    const baseQ = q.mul(UNIT_MULT[u] ?? 1)      // ea→1, dozen→12, serve→1
    const baseY = yieldQuantity.mul(UNIT_MULT[yu] ?? 1)
    return baseY.gt(0) ? baseQ.div(baseY).mul(batchCost) : new Decimal(0)
  }

  // WEIGHT/VOLUME → use yieldWeightGrams
  const baseQty = q.mul(UNIT_MULT[u] ?? 1)
  return yieldWeightGrams.gt(0) ? baseQty.div(yieldWeightGrams).mul(batchCost) : new Decimal(0)
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
        lineCost = calcPrepLineCost(
          Number(item.quantity), item.unit,
          new Decimal(String(sub.batchCost)),
          new Decimal(String(sub.yieldQuantity)),
          sub.yieldUnit,
          new Decimal(String(sub.yieldWeightGrams))
        ).toDecimalPlaces(4)
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
  const freshPreps = await db.preparation.findMany({ select: { id: true, batchCost: true, yieldQuantity: true, yieldUnit: true, yieldWeightGrams: true } })
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
          lineCost = calcPrepLineCost(
            Number(comp.quantity), comp.unit,
            new Decimal(String(prep.batchCost)),
            new Decimal(String(prep.yieldQuantity)),
            prep.yieldUnit,
            new Decimal(String(prep.yieldWeightGrams))
          ).toDecimalPlaces(4)
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
