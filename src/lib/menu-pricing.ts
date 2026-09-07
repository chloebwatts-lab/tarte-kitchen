// Menu price recommendation: the missing last link of the COGS chain.
//
// Every dish already carries totalCost and foodCostPercentage. This turns a
// per-category food-cost target into a concrete selling price, so an
// accepted supplier price increase has somewhere to go.

import type { MenuCategory } from "@/generated/prisma/client"

/** Default target food cost % per menu category, overridable in the database. */
export const DEFAULT_TARGET_FOOD_COST_PCT: Record<MenuCategory, number> = {
  BREAKFAST: 30,
  LUNCH: 30,
  SIDES: 28,
  DRINKS: 22,
  KIDS: 30,
  DESSERT: 28,
  PASTRY: 28,
  SPECIAL: 30,
  OTHER: 30,
}

export const GST_MULTIPLIER = 1.1
/** Menu prices land on 50 cent steps. */
export const PRICE_STEP = 0.5

/**
 * Inc-GST selling price that hits the target food cost, rounded UP to the
 * next 50 cents (rounding down would miss the target by construction).
 */
export function recommendedPrice(totalCost: number, targetFoodCostPct: number): number | null {
  if (!(totalCost > 0) || !(targetFoodCostPct > 0)) return null
  const exGst = totalCost / (targetFoodCostPct / 100)
  const incGst = exGst * GST_MULTIPLIER
  return Math.ceil(incGst / PRICE_STEP - 1e-9) * PRICE_STEP
}

export interface PriceRecommendation {
  targetPct: number
  recommendedPrice: number | null
  /** Positive = should go up. */
  deltaDollars: number | null
  /** Food cost % the recommended price would give. */
  resultingFoodCostPct: number | null
  /** True when the current price already meets the target. */
  onTarget: boolean
}

export function recommend(
  totalCost: number,
  currentSellingPrice: number,
  currentFoodCostPct: number,
  targetPct: number
): PriceRecommendation {
  const rec = recommendedPrice(totalCost, targetPct)
  if (rec === null) {
    return { targetPct, recommendedPrice: null, deltaDollars: null, resultingFoodCostPct: null, onTarget: false }
  }
  const resulting = (totalCost / (rec / GST_MULTIPLIER)) * 100
  const onTarget = currentFoodCostPct <= targetPct + 1e-9
  return {
    targetPct,
    recommendedPrice: rec,
    deltaDollars: Math.round((rec - currentSellingPrice) * 100) / 100,
    resultingFoodCostPct: Math.round(resulting * 10) / 10,
    onTarget,
  }
}
