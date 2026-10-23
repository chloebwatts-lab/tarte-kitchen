/**
 * Full-week spend and takings projections. Pure, so the live tracker, the
 * Sunday email, the Friday digest and Shifts' 5pm owner note (via
 * /api/internal/live-cogs) all project the same way and it can be tested.
 *
 * The spend basis is spend to date INCLUDING the arrival-lag gross-up
 * (estimatedSpentToDate), the same figure "left to spend" is taken from.
 * Until 18 Oct 2026 this divided invoices in hand only, so on a Sunday the
 * pace and COGS columns ignored the deliveries the Left column had already
 * counted and read "On track" on a week that was over budget.
 *
 * Since 22 Oct 2026 the week is "what is in so far plus a usual rest of
 * week", not so-far scaled up. The old way divided spend through TODAY by
 * the delivery share of the days up to YESTERDAY, and with one day of
 * sales a Thursday note read Burleigh "heading for 55.3%" and Currumbin
 * 68%. Backtest over the 12 weeks to 20 Oct 2026, projected COGS % at 5pm
 * against where the week finished: Thursday miss 37 points (worst 138)
 * the old way, 3 points (worst 10) now; Sunday 5 points, now 2.5.
 *
 * Since 23 Oct 2026 the live tracker passes the rest of the week in as
 * usualStillToCome, supplier by supplier (still-to-come.ts), so the pace and
 * the "left to spend" headline add exactly the same deliveries. It is the
 * same usual week (it sums to usualWeekSpend over seven days), split by who
 * delivers on which day, with suppliers already in for today left out.
 */

export interface SpendProjectionInput {
  /// Spent so far: invoices in hand, plus the days before today's
  /// deliveries not invoiced yet (ex GST)
  estimatedSpentToDate: number
  /// 8-week share of a week's deliveries per trading weekday, idx 0 = Wed;
  /// null when there is not enough history
  spendShare: number[] | null
  /// Trading days through today (1-7), for the fallbacks only: with no
  /// supplier pattern they divide spend so far by these days' share
  daysThroughToday: number
  /// A usual full week of deliveries at this week's expected takings
  /// (usualWeekSpend()); null falls back to scaling spend to date up
  usualWeekSpend: number | null
  /// The usual deliveries still to come this week, supplier by supplier
  /// (still-to-come.ts). When given it IS the rest of the week, so the
  /// projection and "left to spend" add the same deliveries.
  usualStillToCome?: number | null
  /// Weekly average of expected suppliers that are overdue or missing
  estimatedMissing: number
}

export interface SpendProjection {
  projectedEndOfWeek: number
  /// usual = so far + usual spend for the days to come; weighted = so far
  /// ÷ the days' usual share; flat = so far ÷ days × 7
  method: "usual" | "weighted" | "flat"
}

const cents = (n: number) => Math.round(n * 100) / 100

export function projectEndOfWeekSpend(input: SpendProjectionInput): SpendProjection {
  const { estimatedSpentToDate, spendShare, estimatedMissing, usualWeekSpend } = input
  const days = Math.min(7, Math.max(1, Math.floor(input.daysThroughToday)))
  const elapsedShare = spendShare ? spendShare.slice(0, days).reduce((a, b) => a + b, 0) : 0
  let fromInvoices: number
  let method: SpendProjection["method"]
  if (input.usualStillToCome != null && Number.isFinite(input.usualStillToCome)) {
    fromInvoices = cents(estimatedSpentToDate + Math.max(0, input.usualStillToCome))
    method = "usual"
  } else if (spendShare != null && usualWeekSpend != null && usualWeekSpend > 0) {
    // The days to come spend what they usually do. Their share of a week
    // comes from the 8-week delivery profile, so a Thursday adds the
    // Friday to Tuesday deliveries, not five more Wednesdays.
    fromInvoices = cents(estimatedSpentToDate + Math.max(0, 1 - elapsedShare) * usualWeekSpend)
    method = "usual"
  } else if (spendShare != null && elapsedShare >= 0.1) {
    fromInvoices = cents(estimatedSpentToDate / elapsedShare)
    method = "weighted"
  } else {
    fromInvoices = cents((estimatedSpentToDate / days) * 7)
    method = "flat"
  }
  // Overdue or missing suppliers: add their full weekly average, as they
  // land in full by week end and are not in the invoice history either.
  return { projectedEndOfWeek: cents(fromInvoices + estimatedMissing), method }
}

export interface RevenueProjectionInput {
  /// Takings ex GST on the completed, counted days; null when none yet
  revenueToDate: number | null
  daysReported: number
  /// Usual share of a week's takings on the counted days (8-week profile);
  /// null when there is not enough history
  reportedShare: number | null
  /// Managers' sales forecast for the week, ex GST
  forecast: number | null
  /// Average week of takings over the last 8 weeks, ex GST
  usualWeekRevenue: number | null
}

export interface RevenueProjection {
  projectedRevenueExGst: number | null
  /// forecast / usual = so far + that week's share for the days to come;
  /// weighted = so far ÷ the days' usual share; flat = so far ÷ days × 7
  method: "forecast" | "usual" | "weighted" | "flat" | null
}

/**
 * Where the week's takings land: what is in plus the forecast's share for
 * the days still to come (the way Shifts' sales baseline does it), so one
 * busy or quiet Wednesday is not multiplied by ten.
 */
export function projectWeekRevenue(input: RevenueProjectionInput): RevenueProjection {
  const { revenueToDate, daysReported, reportedShare, forecast, usualWeekRevenue } = input
  if (revenueToDate == null || daysReported <= 0) return { projectedRevenueExGst: null, method: null }
  if (reportedShare != null) {
    const toCome = Math.max(0, 1 - reportedShare)
    if (forecast != null && forecast > 0)
      return { projectedRevenueExGst: cents(revenueToDate + toCome * forecast), method: "forecast" }
    if (usualWeekRevenue != null && usualWeekRevenue > 0)
      return { projectedRevenueExGst: cents(revenueToDate + toCome * usualWeekRevenue), method: "usual" }
    if (reportedShare >= 0.1)
      return { projectedRevenueExGst: cents(Math.max(revenueToDate, revenueToDate / reportedShare)), method: "weighted" }
  }
  return { projectedRevenueExGst: cents((revenueToDate / daysReported) * 7), method: "flat" }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Which of the 8 weeks before this one a @db.Date (UTC midnight of the
 * AEST day) falls in: 0 = the week just gone, 7 = eight weeks back. Null
 * outside that window.
 */
export function historyWeekIndex(weekStartMs: number, dateMs: number): number | null {
  if (!(dateMs < weekStartMs)) return null
  const k = Math.floor((weekStartMs - dateMs - 1) / WEEK_MS)
  return k >= 0 && k < 8 ? k : null
}

export interface HistoryWeek {
  /// Ex GST invoice spend dated that week
  spend: number
  /// Ex GST takings that week
  revenue: number
  /// Distinct days with a takings row that week
  revenueDays: number
}

/// A week with fewer days of takings on file is left out of the usual week
export const FULL_WEEK_MIN_DAYS = 6
/// Fewer full weeks than this and there is no usual week
export const MIN_FULL_WEEKS = 3

/** Indices of the history weeks with all their takings on file. */
export function fullHistoryWeeks(weeks: HistoryWeek[]): number[] {
  return weeks.flatMap((w, i) => (w.revenueDays >= FULL_WEEK_MIN_DAYS && w.revenue > 0 ? [i] : []))
}

/**
 * Spend and takings over the history weeks whose takings are all on file.
 * A week with missing sales days would set its whole spend against part of
 * its takings and push the usual ratio up (6 weeks of 8 turns 26% into
 * 35%), so those weeks are left out on both sides.
 */
export function usualHistory(weeks: HistoryWeek[]): { spend: number; revenue: number; weeks: number } | null {
  const full = fullHistoryWeeks(weeks).map((i) => weeks[i])
  if (full.length < MIN_FULL_WEEKS) return null
  return {
    spend: full.reduce((a, w) => a + w.spend, 0),
    revenue: full.reduce((a, w) => a + w.revenue, 0),
    weeks: full.length,
  }
}

/// Spend-to-takings ratios outside this range mean the history is broken
/// (a missing month of sales, a bulk invoice import), not a real week.
export const USUAL_RATIO_MIN = 0.1
export const USUAL_RATIO_MAX = 0.6

/**
 * A usual full week of deliveries for this week: the last 8 weeks'
 * spend-to-takings ratio applied to the takings this week is expected to
 * do. Null when the history cannot be trusted.
 */
export function usualWeekSpend(input: {
  /// Ex GST invoice spend over the full history weeks (usualHistory)
  historySpend: number
  /// Ex GST takings over the same weeks
  historyRevenue: number
  /// Takings this week is expected to do (projection, else forecast)
  expectedWeekRevenue: number | null
}): number | null {
  const { historySpend, historyRevenue, expectedWeekRevenue } = input
  if (!(historySpend > 0) || !(historyRevenue > 0)) return null
  if (expectedWeekRevenue == null || !(expectedWeekRevenue > 0)) return null
  const ratio = historySpend / historyRevenue
  if (ratio < USUAL_RATIO_MIN || ratio > USUAL_RATIO_MAX) return null
  return cents(expectedWeekRevenue * ratio)
}
