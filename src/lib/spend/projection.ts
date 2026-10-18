/**
 * Full-week spend projection. Pure, so the live tracker, the Sunday email
 * and the Friday digest all project the same way and it can be unit tested.
 *
 * The basis is spend to date INCLUDING the arrival-lag gross-up
 * (estimatedSpentToDate), the same figure "left to spend" is taken from.
 * Until 18 Oct 2026 this divided invoices in hand only, so on a Sunday the
 * pace and COGS columns ignored the deliveries the Left column had already
 * counted and read "On track" on a week that was over budget.
 */

export interface SpendProjectionInput {
  /// Invoices in hand grossed up for deliveries not yet invoiced (ex GST)
  estimatedSpentToDate: number
  /// 8-week share of a week's deliveries per trading weekday, idx 0 = Wed;
  /// null when there is not enough history
  spendShare: number[] | null
  /// Fully elapsed trading days (1-7), the current partial day excluded
  daysElapsedFull: number
  /// Weekly average of expected suppliers that are overdue or missing
  estimatedMissing: number
}

export interface SpendProjection {
  projectedEndOfWeek: number
  method: "weighted" | "flat"
}

export function projectEndOfWeekSpend(input: SpendProjectionInput): SpendProjection {
  const { estimatedSpentToDate, spendShare, daysElapsedFull, estimatedMissing } = input
  const elapsedShare = spendShare
    ? spendShare.slice(0, daysElapsedFull).reduce((a, b) => a + b, 0)
    : 0
  // Preferred: divide by the share of a typical week's deliveries that lands
  // on the elapsed weekdays. Fallback: flat daily-rate extrapolation.
  // For the missing-supplier component, add the full weekly avg rather than
  // scaling (these land in full by week end).
  const weighted = spendShare != null && elapsedShare >= 0.1
  const fromInvoices = weighted
    ? Math.round((estimatedSpentToDate / elapsedShare) * 100) / 100
    : daysElapsedFull > 0
      ? Math.round((estimatedSpentToDate / daysElapsedFull) * 7 * 100) / 100
      : 0
  return {
    projectedEndOfWeek: Math.round((fromInvoices + estimatedMissing) * 100) / 100,
    method: weighted ? "weighted" : "flat",
  }
}
