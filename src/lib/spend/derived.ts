/**
 * Pure arithmetic for the live spend tracker. Kept out of
 * `current-week.ts` because that file is "use server" and may only export
 * async functions, and out of `types.ts` so the unit tests can exercise
 * the derivations without touching Prisma.
 *
 * Everything here rounds to the cent so the snapshot, the /spend page and
 * the Sunday email print identical figures.
 */

const cents = (n: number): number => Math.round(n * 100) / 100

/**
 * Full-week revenue projection from the days reported so far.
 *
 * Preferred: divide takings-so-far by the share of a typical week those
 * reported weekdays represent (8-week weekday profile). Fallback: flat
 * ÷days×7. The weighted read is only trusted once the reported days cover
 * at least 10% of a normal week, otherwise a single quiet day would blow
 * the projection out.
 *
 * `reportedIdx` are trading-day indexes (0 = Wed … 6 = Tue) with an EOD
 * report in; `shares` is the weekday profile in the same order, or null
 * when there is not enough history to build one.
 */
export function projectWeekRevenue(params: {
  revenueToDate: number | null
  reportedIdx: number[]
  shares: number[] | null
}): {
  projected: number | null
  method: "weighted" | "flat" | null
} {
  const { revenueToDate, reportedIdx, shares } = params
  if (revenueToDate == null) return { projected: null, method: null }
  const daysReported = reportedIdx.length
  if (daysReported === 0) return { projected: null, method: null }
  const reportedShare = shares
    ? reportedIdx.reduce((sum, i) => sum + (shares[i] ?? 0), 0)
    : 0
  const weighted = shares != null && reportedShare >= 0.1
  const projected = weighted
    ? cents(revenueToDate / reportedShare)
    : cents((revenueToDate / daysReported) * 7)
  return { projected, method: weighted ? "weighted" : "flat" }
}

/**
 * The allowance at target on the takings we are actually seeing:
 * projected full-week revenue × target %. Null until an EOD report lands.
 *
 * The forecast-based `budget` stays the planning number; this is what the
 * same target % buys when trade runs above (or below) that forecast, so
 * managers do not read a forecast-based "left to spend" as a hard cap on a
 * week that is beating forecast.
 */
export function budgetOnPace(
  projectedRevenueExGst: number | null,
  targetPct: number
): number | null {
  if (projectedRevenueExGst == null) return null
  return cents((projectedRevenueExGst * targetPct) / 100)
}

/** budgetOnPace − effectiveSpent, or null when there is no pace budget. */
export function remainingOnPace(
  budgetOnPace: number | null,
  effectiveSpent: number
): number | null {
  if (budgetOnPace == null) return null
  return cents(budgetOnPace - effectiveSpent)
}

/**
 * Projected COGS % as the bookkeeper's weekly xlsx will report it for
 * Currumbin: the combined Beach House + Tea Garden spend divided by Beach
 * House revenue ONLY. Because the denominator drops the Tea Garden's
 * takings, this reads a couple of points above the tracker's combined
 * figure for the same week. Null when there is no Beach House revenue to
 * divide by (no EOD report yet, or a zero), so the UI never prints
 * Infinity or NaN.
 */
export function louiseBasisPct(
  projectedSpend: number,
  projectedBeachHouseRevenueExGst: number | null
): number | null {
  if (projectedBeachHouseRevenueExGst == null) return null
  if (!(projectedBeachHouseRevenueExGst > 0)) return null
  return Math.round((projectedSpend / projectedBeachHouseRevenueExGst) * 1000) / 10
}
