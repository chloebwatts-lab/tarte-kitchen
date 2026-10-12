/**
 * What a below-Manager sign-in gets from the prep sheet: the same preps and
 * quantities, with batch costs and per-dish sales forecasts zeroed. Pure, so
 * the walk-through's data contract can be tested without a database.
 */
import type { PrepSheet } from "@/lib/actions/prep-sheet"

export function stripPrepNumbers(sheet: PrepSheet): PrepSheet {
  return {
    ...sheet,
    totalCost: 0,
    lines: sheet.lines.map((l) => ({
      ...l,
      batchCost: 0,
      totalCost: 0,
      drivers: l.drivers.map((d) => ({ ...d, forecastQty: 0 })),
    })),
    unmatchedForecast: sheet.unmatchedForecast.map((u) => ({ ...u, forecastQty: 0 })),
  }
}
