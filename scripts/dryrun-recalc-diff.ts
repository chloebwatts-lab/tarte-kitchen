/**
 * Read-only dry run of recalculate-all.ts: recompute every prep batchCost and
 * dish totalCost with the current (fixed) logic and report diffs vs stored
 * values. Writes nothing. Iterates preps to fixpoint so prep-on-prep chains
 * use recomputed sub-prep costs.
 */
import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "../src/generated/prisma/client"
import Decimal from "decimal.js"

const UNIT_MULT: Record<string, number> = {
  g: 1, kg: 1000, ml: 1, l: 1000, ea: 1, dozen: 12, oz: 28.3495, lb: 453.592,
}
const WEIGHT_UNITS = new Set(["g", "kg", "oz", "lb"])
const VOLUME_UNITS = new Set(["ml", "l", "cl"])
const COUNT_UNITS = new Set(["ea", "dozen", "serve"])

const db = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
})

function calcIngredientLineCost(
  quantity: number, unit: string, purchasePrice: Decimal, baseUnitsPerPurchase: Decimal,
  wastePercentage: Decimal, baseUnitType: string, gramsPerUnit: Decimal | null
): Decimal {
  const wasteFactor = new Decimal(1).minus(wastePercentage.div(100))
  const usable = baseUnitsPerPurchase.mul(wasteFactor)
  if (usable.isZero()) return new Decimal(0)
  const cpbu = purchasePrice.div(usable)
  const u = unit.toLowerCase()
  if (baseUnitType === "COUNT" && (WEIGHT_UNITS.has(u) || VOLUME_UNITS.has(u)) && gramsPerUnit && !gramsPerUnit.isZero()) {
    const baseInRecipe = new Decimal(quantity).mul(UNIT_MULT[u] ?? 1)
    return baseInRecipe.div(gramsPerUnit).mul(cpbu)
  }
  return new Decimal(quantity).mul(UNIT_MULT[u] ?? 1).mul(cpbu)
}

function calcPrepLineCost(
  quantity: number, unit: string, batchCost: Decimal, yieldQuantity: Decimal,
  yieldUnit: string, yieldWeightGrams: Decimal
): Decimal {
  const q = new Decimal(quantity)
  const u = unit.toLowerCase()
  const yu = yieldUnit.toLowerCase()
  const unitIsCount = COUNT_UNITS.has(u)
  const yieldIsCount = yu === "serve" || yu === "ea"
  if (unitIsCount && yieldIsCount) {
    const baseQ = q.mul(UNIT_MULT[u] ?? 1)
    const baseY = yieldQuantity.mul(UNIT_MULT[yu] ?? 1)
    return baseY.gt(0) ? baseQ.div(baseY).mul(batchCost) : new Decimal(0)
  }
  const baseQty = q.mul(UNIT_MULT[u] ?? 1)
  return yieldWeightGrams.gt(0) ? baseQty.div(yieldWeightGrams).mul(batchCost) : new Decimal(0)
}

async function main() {
  const preps = await db.preparation.findMany({
    include: { items: { include: { ingredient: true, subPreparation: true } } },
  })

  // simulated batch costs, seeded with stored values, iterated to fixpoint
  const sim = new Map<string, Decimal>()
  for (const p of preps) sim.set(p.id, new Decimal(String(p.batchCost)))

  for (let pass = 0; pass < 5; pass++) {
    let changed = false
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
            sim.get(sub.id) ?? new Decimal(String(sub.batchCost)),
            new Decimal(String(sub.yieldQuantity)),
            sub.yieldUnit,
            new Decimal(String(sub.yieldWeightGrams))
          ).toDecimalPlaces(4)
        }
        batchCost = batchCost.plus(lineCost)
      }
      batchCost = batchCost.toDecimalPlaces(2)
      if (!batchCost.eq(sim.get(prep.id)!)) {
        sim.set(prep.id, batchCost)
        changed = true
      }
    }
    if (!changed) break
  }

  console.log("--- PREP diffs (stored batchCost -> recomputed), threshold $0.02 ---")
  let prepDiffs = 0
  for (const p of preps) {
    const stored = new Decimal(String(p.batchCost))
    const calc = sim.get(p.id)!
    if (calc.minus(stored).abs().gte(0.02)) {
      prepDiffs++
      console.log(`  ${p.name.padEnd(45)} $${stored} -> $${calc}`)
    }
  }
  console.log(`  total: ${prepDiffs} of ${preps.length} preps differ`)

  const dishes = await db.dish.findMany({
    include: { components: { include: { ingredient: true, preparation: true } } },
  })
  const prepMeta = new Map(preps.map((p) => [p.id, p]))

  console.log("\n--- DISH diffs (stored totalCost -> recomputed), threshold $0.02 ---")
  let dishDiffs = 0
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
        const meta = prepMeta.get(comp.preparationId!)
        if (meta) {
          lineCost = calcPrepLineCost(
            Number(comp.quantity), comp.unit,
            sim.get(meta.id)!,
            new Decimal(String(meta.yieldQuantity)),
            meta.yieldUnit,
            new Decimal(String(meta.yieldWeightGrams))
          ).toDecimalPlaces(4)
        }
      }
      totalCost = totalCost.plus(lineCost)
    }
    totalCost = totalCost.toDecimalPlaces(2)
    const stored = new Decimal(String(dish.totalCost))
    if (totalCost.minus(stored).abs().gte(0.02)) {
      dishDiffs++
      console.log(`  ${dish.name.padEnd(45)} $${stored} -> $${totalCost}`)
    }
  }
  console.log(`  total: ${dishDiffs} of ${dishes.length} dishes differ`)
}

main().finally(() => db.$disconnect())
