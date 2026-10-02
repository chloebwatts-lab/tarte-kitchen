/**
 * Pure sales comparison maths for the live tiles: today vs the same weekday
 * last week and vs the 4-week same-weekday average; week-to-date vs the
 * same days last week. All inputs are AEST calendar dates as YYYY-MM-DD and
 * ex-GST revenue, which is what DailySalesSummary stores.
 */

export interface DayRevenue {
  date: string // YYYY-MM-DD
  revenueExGst: number
}

export interface SalesComparison {
  today: number
  /** Same weekday last week; null when that day has no row. */
  sameDayLastWeek: number | null
  /** Average of the same weekday over the previous 4 weeks (days with a row). */
  fourWeekAvgSameDay: number | null
  /** % change today vs same day last week, 1dp; null without a baseline. */
  todayVsLastWeekPct: number | null
  /** % change today vs the 4-week average, 1dp. */
  todayVsFourWeekPct: number | null
  /** Wed → today inclusive, this week. */
  weekToDate: number
  /** The same Wed → weekday span last week. */
  lastWeekSameDays: number | null
  weekToDateVsLastWeekPct: number | null
  /** Last week's full Wed → Tue total. */
  lastWeekTotal: number | null
}

export function shiftDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Wednesday that starts the Tarte trading week containing `dateStr`. */
export function tarteWeekStart(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 Sun .. 6 Sat; Wed = 3
  const back = (dow - 3 + 7) % 7
  return shiftDate(dateStr, -back)
}

export function pctChange(now: number, base: number | null): number | null {
  if (base === null || base <= 0) return null
  return Math.round(((now - base) / base) * 1000) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * `rows` may cover any range; only the days needed are read. A day with no
 * row counts as absent (null), not zero, so a venue that is closed on
 * Mondays does not drag the average down with a fake $0.
 */
export function compareSales(rows: DayRevenue[], today: string): SalesComparison {
  const byDate = new Map<string, number>()
  for (const r of rows) byDate.set(r.date, (byDate.get(r.date) ?? 0) + r.revenueExGst)
  const get = (d: string): number | null => (byDate.has(d) ? byDate.get(d)! : null)

  // No row for today yet (POS not synced): show today as $0 but do not
  // call it a 100% drop, and compare week-to-date against last week up to
  // yesterday only, so the missing day does not read as a collapse.
  const todayPresent = byDate.has(today)
  const todayRev = get(today) ?? 0
  const sameDayLastWeek = get(shiftDate(today, -7))

  const priorSameDays: number[] = []
  for (let w = 1; w <= 4; w++) {
    const v = get(shiftDate(today, -7 * w))
    if (v !== null) priorSameDays.push(v)
  }
  const fourWeekAvg =
    priorSameDays.length > 0
      ? round2(priorSameDays.reduce((s, v) => s + v, 0) / priorSameDays.length)
      : null

  const weekStart = tarteWeekStart(today)
  let weekToDate = 0
  let lastWeekSameDays = 0
  let lastWeekSeen = false
  for (let d = weekStart; d <= today; d = shiftDate(d, 1)) {
    weekToDate += get(d) ?? 0
    if (d === today && !todayPresent) continue
    const lw = get(shiftDate(d, -7))
    if (lw !== null) {
      lastWeekSameDays += lw
      lastWeekSeen = true
    }
  }
  let lastWeekTotal = 0
  let lastWeekTotalSeen = false
  const lastWeekStart = shiftDate(weekStart, -7)
  for (let i = 0; i < 7; i++) {
    const v = get(shiftDate(lastWeekStart, i))
    if (v !== null) {
      lastWeekTotal += v
      lastWeekTotalSeen = true
    }
  }

  return {
    today: round2(todayRev),
    sameDayLastWeek: sameDayLastWeek === null ? null : round2(sameDayLastWeek),
    fourWeekAvgSameDay: fourWeekAvg,
    todayVsLastWeekPct: todayPresent ? pctChange(todayRev, sameDayLastWeek) : null,
    todayVsFourWeekPct: todayPresent ? pctChange(todayRev, fourWeekAvg) : null,
    weekToDate: round2(weekToDate),
    lastWeekSameDays: lastWeekSeen ? round2(lastWeekSameDays) : null,
    weekToDateVsLastWeekPct: pctChange(weekToDate, lastWeekSeen ? lastWeekSameDays : null),
    lastWeekTotal: lastWeekTotalSeen ? round2(lastWeekTotal) : null,
  }
}

/** "+8%" / "-3%" / "" for display. */
export function fmtPctChange(pct: number | null): string {
  if (pct === null) return ""
  const rounded = Math.round(pct)
  return `${rounded > 0 ? "+" : ""}${rounded}%`
}

/** Short weekday label for "vs last Thu". */
export function weekdayShort(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", timeZone: "UTC" })
}
