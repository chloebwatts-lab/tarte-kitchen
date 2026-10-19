/**
 * Pure expansion of sold dishes into theoretical ingredient usage.
 *
 * Kept free of Prisma so it can be unit tested. `calculateTheoreticalUsage`
 * in enrich.ts loads the data and calls `expandDishUsage`.
 *
 * Rules (mirror the costing engine in src/lib/units.ts so theoretical usage
 * and theoretical cost agree):
 *  - A preparation used in a dish contributes the DISH'S SHARE of the batch:
 *    300 g of a 11,250 g batch is 300/11250 of every item in that batch.
 *    Serve against serve yield is quantity/yieldQuantity.
 *  - Ingredient quantities are converted to the ingredient's base unit
 *    (g / ml / ea). COUNT ingredients used by weight go through gramsPerUnit.
 *  - Sub-preparations are followed recursively, each level scaled by its
 *    own batch fraction. Cycles and runaway depth are cut off.
 */

import Decimal from "decimal.js"
import {
  getUnitType,
  preparationBatchFraction,
  toBaseUnits,
  type BaseUnitType,
} from "@/lib/units"

export type UsageIngredient = {
  id: string
  baseUnitType: BaseUnitType | string
  gramsPerUnit: Decimal | number | string | null
}

export type UsagePreparation = {
  id: string
  yieldQuantity: Decimal | number | string
  yieldUnit: string
  yieldWeightGrams: Decimal | number | string
  items: UsageLine[]
}

/** A DishComponent or PreparationItem. */
export type UsageLine = {
  ingredientId?: string | null
  ingredient?: UsageIngredient | null
  preparationId?: string | null
  subPreparationId?: string | null
  quantity: Decimal | number | string
  unit: string
  lineCost: Decimal | number | string
}

export type UsageAccumulator = Map<
  string,
  { qty: Decimal; cost: Decimal; unit: string }
>

export const MAX_PREP_DEPTH = 6

export function baseUnitFor(baseUnitType: string): "g" | "ml" | "ea" {
  if (baseUnitType === "WEIGHT") return "g"
  if (baseUnitType === "VOLUME") return "ml"
  return "ea"
}

/**
 * Quantity of an ingredient line in the ingredient's base unit.
 * Never throws: an unknown recipe unit (bunch, punnet) counts 1:1, and a
 * weight/volume mismatch (cream in g) is taken 1:1, which is what the
 * costing engine does too.
 */
export function ingredientBaseQuantity(
  quantity: Decimal | number | string,
  unit: string,
  ingredient: Pick<UsageIngredient, "baseUnitType" | "gramsPerUnit">
): Decimal {
  const q = new Decimal(quantity)
  const unitType = getUnitType(unit)
  if (!unitType) return q
  const gpu = ingredient.gramsPerUnit == null ? null : new Decimal(ingredient.gramsPerUnit)
  if (
    ingredient.baseUnitType === "COUNT" &&
    (unitType === "WEIGHT" || unitType === "VOLUME") &&
    gpu &&
    !gpu.isZero()
  ) {
    return toBaseUnits(q, unit).div(gpu)
  }
  return toBaseUnits(q, unit)
}

/**
 * Walk a dish's components (or a preparation's items) and add
 * `multiplier` x their ingredient quantities to `acc`.
 *
 * @param lines      DishComponent[] or PreparationItem[]
 * @param multiplier dishes sold x batch fraction so far
 * @param preps      every preparation by id, with items
 * @param acc        running totals by ingredient id
 */
export function expandDishUsage(
  lines: UsageLine[],
  multiplier: Decimal | number,
  preps: Map<string, UsagePreparation>,
  acc: UsageAccumulator,
  path: string[] = []
): UsageAccumulator {
  const mult = new Decimal(multiplier)
  if (mult.isZero()) return acc

  for (const line of lines) {
    if (line.ingredientId && line.ingredient) {
      const key = line.ingredientId
      const existing = acc.get(key) ?? {
        qty: new Decimal(0),
        cost: new Decimal(0),
        unit: baseUnitFor(String(line.ingredient.baseUnitType)),
      }
      existing.qty = existing.qty.plus(
        ingredientBaseQuantity(line.quantity, line.unit, line.ingredient).mul(mult)
      )
      existing.cost = existing.cost.plus(new Decimal(line.lineCost).mul(mult))
      acc.set(key, existing)
      continue
    }

    const prepId = line.preparationId ?? line.subPreparationId
    if (!prepId) continue
    if (path.includes(prepId) || path.length >= MAX_PREP_DEPTH) continue
    const prep = preps.get(prepId)
    if (!prep) continue

    const fraction = preparationBatchFraction(
      line.quantity,
      line.unit,
      prep.yieldQuantity,
      prep.yieldUnit,
      prep.yieldWeightGrams
    )
    if (fraction.isZero()) continue

    expandDishUsage(prep.items, mult.mul(fraction), preps, acc, [...path, prepId])
  }
  return acc
}
