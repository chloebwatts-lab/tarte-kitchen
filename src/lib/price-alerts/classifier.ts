import type { IngredientCategory } from "@/generated/prisma/client"

/// Categories that flow into the PRODUCE alert stream. These are inherently
/// volatile — weekly invoice prices fluctuate by 10-30% as a normal part of
/// seasonality and market conditions, so a single-invoice spike isn't signal.
/// PRODUCE alerts compare against a 4-week trailing median and require
/// confirmation across ≥2 deliveries before flagging.
const PRODUCE_CATEGORIES: ReadonlySet<IngredientCategory> = new Set([
  "VEGETABLE",
  "FRUIT",
  "HERB",
  "MUSHROOM",
  "SALAD",
] as IngredientCategory[])

export function streamForCategory(
  cat: IngredientCategory
): "PRODUCE" | "STABLE" {
  return PRODUCE_CATEGORIES.has(cat) ? "PRODUCE" : "STABLE"
}

/// Stable-stream thresholds: any change ≥5% (either direction) is signal.
/// Drops matter — Bidfood rebate refreshes go un-noticed otherwise.
export const STABLE_FLAG_THRESHOLD_PCT = 5

/// Produce-stream thresholds: only flag if current invoice is ≥25% above
/// the 4-week trailing median AND it's confirmed on ≥2 consecutive deliveries.
export const PRODUCE_FLAG_THRESHOLD_PCT = 25
export const PRODUCE_CONFIRMATION_DELIVERIES = 2
export const PRODUCE_WINDOW_WEEKS = 4
