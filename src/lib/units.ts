import Decimal from "decimal.js"

// ============================================================
// Unit Conversion Engine
// Solves THE biggest pain point from Chef Notepad
// ============================================================

export type BaseUnitType = "WEIGHT" | "VOLUME" | "COUNT"

// All units we support, mapped to their base unit type
const UNIT_DEFINITIONS: Record<string, { type: BaseUnitType; toBase: number }> = {
  // Weight → base is grams
  g:     { type: "WEIGHT", toBase: 1 },
  kg:    { type: "WEIGHT", toBase: 1000 },
  oz:    { type: "WEIGHT", toBase: 28.3495 },
  lb:    { type: "WEIGHT", toBase: 453.592 },

  // Volume → base is milliliters
  ml:    { type: "VOLUME", toBase: 1 },
  cl:    { type: "VOLUME", toBase: 10 },
  l:     { type: "VOLUME", toBase: 1000 },

  // Count → base is "each"
  ea:    { type: "COUNT", toBase: 1 },
  dozen: { type: "COUNT", toBase: 12 },

  // Special: "serve" is used for preparations
  serve: { type: "COUNT", toBase: 1 },
}

/** Get the base unit type for a given unit string */
export function getUnitType(unit: string): BaseUnitType | null {
  const def = UNIT_DEFINITIONS[unit.toLowerCase()]
  return def?.type ?? null
}

/** Convert a quantity from one unit to base units (g, ml, or ea) */
export function toBaseUnits(quantity: Decimal | number, unit: string): Decimal {
  const q = new Decimal(quantity)
  const def = UNIT_DEFINITIONS[unit.toLowerCase()]
  if (!def) throw new Error(`Unknown unit: ${unit}`)
  return q.mul(def.toBase)
}

/** Convert from base units back to a display unit */
export function fromBaseUnits(baseQuantity: Decimal | number, targetUnit: string): Decimal {
  const q = new Decimal(baseQuantity)
  const def = UNIT_DEFINITIONS[targetUnit.toLowerCase()]
  if (!def) throw new Error(`Unknown unit: ${targetUnit}`)
  return q.div(def.toBase)
}

/** Get compatible recipe units for a given base unit type */
export function getRecipeUnits(baseUnitType: string): string[] {
  switch (baseUnitType) {
    case "WEIGHT": return ["g", "kg"]
    case "VOLUME": return ["ml", "l"]
    case "COUNT":  return ["ea", "dozen"]
    default: return ["g", "kg", "ml", "l", "ea"]
  }
}

/** Get units available when using a preparation in a recipe */
export function getPreparationUnits(): string[] {
  return ["g", "kg", "ml", "l", "serve"]
}

/** All purchase-only units (never shown in recipe builders) */
export const PURCHASE_UNITS = [
  "g", "kg", "oz", "lb",
  "ml", "cl", "l",
  "ea", "dozen",
  "carton", "box", "bag", "packet", "case", "tub", "bottle", "bunch",
]

/** Recipe units only — no packaging units */
export const RECIPE_UNITS = ["g", "kg", "ml", "l", "ea", "dozen", "serve"]

// ============================================================
// Cost Calculations
// ============================================================

export interface IngredientCostInfo {
  purchasePrice: Decimal
  baseUnitsPerPurchase: Decimal // total grams/ml/ea per purchase
  wastePercentage: Decimal     // 0-100
}

/**
 * Calculate cost per base unit (per gram, per ml, or per ea)
 * accounting for waste/trim.
 *
 * Example: Striploin $33/kg, 38% waste
 *   costPerGram = 33 / (1000 × (1 - 0.38)) = $0.0532/g usable
 */
export function costPerBaseUnit(info: IngredientCostInfo): Decimal {
  const wasteFactor = new Decimal(1).minus(info.wastePercentage.div(100))
  const usableUnits = info.baseUnitsPerPurchase.mul(wasteFactor)
  if (usableUnits.isZero()) return new Decimal(0)
  return info.purchasePrice.div(usableUnits)
}

/**
 * Calculate the cost of using a quantity of an ingredient in a recipe.
 *
 * Example: "60g smoked salmon" where salmon is $42/kg (= $0.042/g)
 *   lineCost = 60 × 0.042 = $2.52
 */
export function ingredientLineCost(
  quantity: Decimal | number,
  unit: string,
  costInfo: IngredientCostInfo
): Decimal {
  const baseQty = toBaseUnits(quantity, unit)
  const perUnit = costPerBaseUnit(costInfo)
  return baseQty.mul(perUnit)
}

/**
 * Calculate the cost of using a preparation in a dish.
 *
 * Handles both gram-based and serve-based references:
 * - "100g of crumpets" → 100/3800 × batchCost
 * - "2 serves of crumpets" → 2/76 × batchCost
 */
export function preparationLineCost(
  quantity: Decimal | number,
  unit: string,
  batchCost: Decimal | number,
  yieldQuantity: Decimal | number,
  yieldUnit: string,
  yieldWeightGrams: Decimal | number
): Decimal {
  const q = new Decimal(quantity)
  const batch = new Decimal(batchCost)
  const yieldQty = new Decimal(yieldQuantity)
  const yieldGrams = new Decimal(yieldWeightGrams)

  const unitLower = unit.toLowerCase()

  // If using "serve" units, calculate as fraction of yield quantity
  if (unitLower === "serve") {
    if (yieldQty.isZero()) return new Decimal(0)
    return q.div(yieldQty).mul(batch)
  }

  // For weight/volume units, convert to grams and calculate fraction
  const baseQty = toBaseUnits(q, unitLower)
  if (yieldGrams.isZero()) return new Decimal(0)
  return baseQty.div(yieldGrams).mul(batch)
}

/**
 * Calculate food cost percentage (Australian GST: 10%)
 * foodCost% = (totalCost / sellingPriceExGst) × 100
 */
export function foodCostPercentage(totalCost: Decimal | number, sellingPriceIncGst: Decimal | number): Decimal {
  const cost = new Decimal(totalCost)
  const exGst = new Decimal(sellingPriceIncGst).div(1.1)
  if (exGst.isZero()) return new Decimal(0)
  return cost.div(exGst).mul(100)
}

/** Get ex-GST price (Australia: divide by 1.1) */
export function exGst(priceIncGst: Decimal | number): Decimal {
  return new Decimal(priceIncGst).div(1.1)
}

/** Get traffic light color for food cost % */
export function costTrafficLight(pct: Decimal | number): "green" | "amber" | "red" {
  const p = new Decimal(pct)
  if (p.lt(30)) return "green"
  if (p.lte(35)) return "amber"
  return "red"
}
