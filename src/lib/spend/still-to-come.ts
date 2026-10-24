/**
 * The deliveries that usually still land before the week closes, supplier
 * by supplier. "Left to spend" used to be budget minus what had come in, so
 * on Sunday 18 Oct 2026 Burleigh read $3,708 left while the usual Monday
 * (Bidfood, Eustralis, eggs, meat, F&V, bread) and Tuesday were still on the
 * way: $8,020 landed and the week finished $3.7k over. The headline is now
 * budget minus what has come in minus these.
 *
 * Each supplier's usual is its 8-week average spend on that trading weekday
 * (over the history weeks with all their takings on file), scaled to the
 * takings this week is expected to do, so over a whole week the suppliers add
 * up to usualWeekSpend() in projection.ts. A supplier that has already
 * invoiced for a day is done for that day: its usual for the day is not
 * added again, so a big Bidfood drop that is already in is never counted
 * twice. Pure, so the backtest and the tests run the code that ships.
 */

export const TRADING_DAY_NAMES = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"] as const

export interface SupplierDayRow {
  /// Canonical supplier name (matchExpectedSupplier, else the invoice name)
  supplier: string
  /// History week, 0 = the week just gone (historyWeekIndex)
  week: number
  /// Trading day, 0 = Wed ... 6 = Tue
  day: number
  /// Ex GST, this bucket's share
  amount: number
}

export interface StillToComeRow {
  supplier: string
  /// Ex GST usual for the rest of this week, at this week's trade
  amount: number
  /// Trading days it usually still lands on, in week order
  days: string[]
}

export interface StillToCome {
  /// Sum of the rows, to the cent
  total: number
  rows: StillToComeRow[]
}

/** Rows under this are noise (a $3 credit average), left out of the list and the total. */
export const STILL_TO_COME_MIN_ROW = 1

const cents = (n: number) => Math.round(n * 100) / 100

/**
 * Each supplier's usual per trading day (idx 0 = Wed), ex GST at this week's
 * trade: its 8-week weekday average over `weeks`, times `scale`. The one
 * basis for both what is still to come and what is overdue (overdue-gap.ts).
 * Null when there is nothing to average over.
 */
export function supplierWeekdayUsual(input: {
  history: SupplierDayRow[]
  weeks: number[]
  scale: number
}): Map<string, number[]> | null {
  const { history, weeks, scale } = input
  if (weeks.length === 0 || !(scale > 0) || !Number.isFinite(scale)) return null
  const use = new Set(weeks)
  const bySupplier = new Map<string, number[]>()
  for (const r of history) {
    if (!use.has(r.week) || r.day < 0 || r.day > 6) continue
    const days = bySupplier.get(r.supplier) ?? new Array<number>(7).fill(0)
    days[r.day] += r.amount
    bySupplier.set(r.supplier, days)
  }
  const usual = new Map<string, number[]>()
  for (const [supplier, days] of bySupplier) usual.set(supplier, days.map((v) => (v / weeks.length) * scale))
  return usual
}

export function usualStillToCome(input: {
  history: SupplierDayRow[]
  /// History weeks to average over (fullHistoryWeeks in projection.ts)
  weeks: number[]
  /// This week's expected takings over a usual week's takings
  scale: number
  /// Today, 0 = Wed ... 6 = Tue
  todayIdx: number
  /// Supplier -> trading days of this week it has already invoiced for
  invoiced: ReadonlyMap<string, ReadonlySet<number>>
}): StillToCome | null {
  const usual = supplierWeekdayUsual(input)
  if (!usual) return null
  const todayIdx = Math.min(6, Math.max(0, Math.floor(input.todayIdx)))
  const rows: StillToComeRow[] = []
  for (const [supplier, days] of usual) {
    const done = input.invoiced.get(supplier)
    const perDay = days.map((v, i) => (i < todayIdx || done?.has(i) ? 0 : v))
    const amount = cents(perDay.reduce((a, b) => a + b, 0))
    if (!(amount >= STILL_TO_COME_MIN_ROW)) continue
    rows.push({
      supplier,
      amount,
      days: perDay.flatMap((v, i) => (v >= STILL_TO_COME_MIN_ROW ? [TRADING_DAY_NAMES[i]] : [])),
    })
  }
  rows.sort((a, b) => b.amount - a.amount || a.supplier.localeCompare(b.supplier))
  return { total: cents(rows.reduce((a, r) => a + r.amount, 0)), rows }
}
