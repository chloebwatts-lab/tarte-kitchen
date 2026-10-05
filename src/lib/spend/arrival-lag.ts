/**
 * Invoices trail deliveries: on a Monday evening roughly a tenth of what has
 * already been delivered that week has not been invoiced yet. This asks the
 * last 8 weeks "at this same point in the week, what share of the spend dated
 * up to today had actually arrived?" so the live page can show real spend to
 * date, not just the invoices in hand.
 */

const BRISBANE_OFFSET_MS = 10 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface ArrivalLagRow {
  /// Wed 00:00 of the row's trading week (UTC midnight of the AEST date)
  weekStartMs: number
  /// invoiceDate (UTC midnight of the AEST date)
  invoiceDateMs: number
  /// When the invoice row was created, real instant
  createdAtMs: number
  amount: number
}

/**
 * Share (0.4 to 1) of spend dated within the first `daysThroughToday` days of
 * a week that had been ingested `elapsedMs` into that week. Null when there
 * is not enough history to trust.
 */
export function arrivalCompleteness(
  rows: ArrivalLagRow[],
  elapsedMs: number,
  daysThroughToday: number
): number | null {
  let arrived = 0
  let eventual = 0
  let counted = 0
  for (const r of rows) {
    const dayIdx = Math.floor((r.invoiceDateMs - r.weekStartMs) / DAY_MS)
    if (dayIdx < 0 || dayIdx >= daysThroughToday) continue
    counted++
    eventual += r.amount
    if (r.createdAtMs + BRISBANE_OFFSET_MS - r.weekStartMs <= elapsedMs) arrived += r.amount
  }
  if (counted < 14 || eventual <= 0) return null
  return Math.min(1, Math.max(0.4, arrived / eventual))
}
