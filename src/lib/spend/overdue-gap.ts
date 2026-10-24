/**
 * Deliveries already made this week whose invoices have stopped coming in.
 *
 * On Sunday 25 Oct 2026 Pixel Bread (daily bread, invoices daily from Xero)
 * had sent nothing since Wednesday. The headline ignored the Thursday to
 * Saturday bread completely (about $1,000 at Burleigh, $700 at Currumbin),
 * while the pace added Pixel's whole 4-week average week on top of the
 * $152 already in and the Sunday to Tuesday bread already in still to come:
 * Burleigh read $237 left and 30.6% COGS when the real figure was about
 * 29.4%. One too low, one too high.
 *
 * Now the gap is the supplier's usual (supplierWeekdayUsual, the same 8-week
 * weekday average at this week's trade that still-to-come.ts uses) for each
 * day of this week before today that it has not invoiced, inside a run of
 * days with no invoice longer than the coverage table's overdue rule allows
 * (more than 2x its usual interval). Today and the days after stay in still
 * to come only, so every day is counted once: in hand, overdue, or to come.
 * The run is judged on its own, so when the supplier starts invoicing again
 * without sending the missing days, those days stay counted.
 *
 * Only a steady supplier gets a gap: one that invoiced this venue in each of
 * the last two weeks, so it has a weekday pattern worth pricing the days at
 * and its silence is a break in invoicing, not a supplier that faded, was
 * dropped or delivers now and then. In practice that is the near-daily ones
 * (Pixel, Fish Factory, Bidfood, Jensens): a weekly supplier is only
 * overdue after two silent weeks, by when it is no longer steady. No gap for:
 *  - a supplier that is not steady. The COGS xlsx 4-week average the pace
 *    used to add is NOT used: it averages only the weeks with spend, so a
 *    supplier that stopped (Tasman Distribution, Global Food & Wine at
 *    Currumbin, 28 and 38 days silent on 25 Oct) kept adding a full week
 *    every week. Backtest 29 Jul to 20 Oct 2026: without this rule Joval,
 *    Tasman and Global Food & Wine raised gaps of $300 to $800 for weeks
 *    after they had stopped. They stay on the coverage table to chase, and
 *    their older weeks stay in the 8-week usual (still to come), which is
 *    right when another supplier took their place.
 *  - suppliers not on the expected list (no usual interval to judge by).
 * Pure, so the backtest and the tests run the code that ships.
 */

import { TRADING_DAY_NAMES } from "./still-to-come"

/// Rows under this are noise, left out of the list and the total
export const OVERDUE_GAP_MIN_ROW = 1

export interface OverdueGapRow {
  supplier: string
  /// Ex GST usual for the days it has not invoiced, at this week's trade
  amount: number
  /// Trading days with no invoice, in week order (Thu, Fri, Sat)
  days: string[]
  /// AEST yyyy-mm-dd of its last invoice for this venue before the gap
  lastInvoiceDate: string | null
}

export interface OverdueGap {
  /// Sum of the rows, to the cent
  total: number
  rows: OverdueGapRow[]
}

const cents = (n: number) => Math.round(n * 100) / 100

export function overdueGap(input: {
  /// Supplier -> usual per trading day this week, idx 0 = Wed (supplierWeekdayUsual)
  usual: ReadonlyMap<string, readonly number[]>
  /// Today, 0 = Wed ... 6 = Tue
  todayIdx: number
  /// Supplier -> usual days between invoices (expected suppliers only)
  intervals: ReadonlyMap<string, number>
  /// Suppliers that invoiced this venue in each of the last two weeks
  steady: ReadonlySet<string>
  /// Supplier -> days with a positive invoice for this venue, as offsets
  /// from this week's Wednesday (history is negative, -56 to -1)
  invoicedOn: ReadonlyMap<string, ReadonlySet<number>>
  /// AEST yyyy-mm-dd of an offset, for the row's last invoice date
  dateOf?: (offset: number) => string
}): OverdueGap {
  const todayIdx = Math.min(6, Math.max(0, Math.floor(input.todayIdx)))
  const rows: OverdueGapRow[] = []
  for (const [supplier, interval] of input.intervals) {
    const usual = input.usual.get(supplier)
    const seen = input.invoicedOn.get(supplier)
    if (!input.steady.has(supplier)) continue
    if (!usual || !seen || seen.size === 0 || !(interval > 0)) continue
    const offsets = [...seen].sort((a, b) => a - b)
    let amount = 0
    let lastBefore: number | null = null
    const days: string[] = []
    for (let d = 0; d < todayIdx; d++) {
      if (seen.has(d)) continue
      // The run of days with no invoice this day sits in: from the last
      // invoice before it to the next one, or to today
      let last: number | null = null
      let next: number | null = null
      for (const o of offsets) {
        if (o < d) last = o
        else if (o > d) {
          next = o
          break
        }
      }
      if (last == null) continue // first invoice is later: nothing to be late against
      // Same rule as the coverage table's "overdue", on this run of days
      const run = Math.min(next ?? todayIdx, todayIdx) - last
      if (!(run > 2 * interval)) continue
      const v = usual[d] ?? 0
      if (!(v >= OVERDUE_GAP_MIN_ROW)) continue
      amount += v
      days.push(TRADING_DAY_NAMES[d])
      lastBefore = lastBefore == null ? last : Math.min(lastBefore, last)
    }
    amount = cents(amount)
    if (!(amount >= OVERDUE_GAP_MIN_ROW)) continue
    rows.push({
      supplier,
      amount,
      days,
      lastInvoiceDate: lastBefore != null && input.dateOf ? input.dateOf(lastBefore) : null,
    })
  }
  rows.sort((a, b) => b.amount - a.amount || a.supplier.localeCompare(b.supplier))
  return { total: cents(rows.reduce((a, r) => a + r.amount, 0)), rows }
}

/** "Thu to Sat" for a run of consecutive days, else "Wed, Fri". */
export function gapDaysLabel(days: string[]): string {
  if (days.length === 0) return ""
  if (days.length === 1) return days[0]
  const idx = days.map((d) => (TRADING_DAY_NAMES as readonly string[]).indexOf(d))
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
  if (consecutive && days.length >= 3) return `${days[0]} to ${days[days.length - 1]}`
  return days.length === 2 ? `${days[0]} and ${days[1]}` : days.join(", ")
}
