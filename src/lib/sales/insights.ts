/**
 * Pure comparison maths for the Sales insights page. Inputs are plain rows
 * (dates as YYYY-MM-DD Brisbane, money inc GST); no I/O.
 */
import { shiftDate, pctChange } from "./compare"

export type CompareMode = "LAST_WEEK" | "WEEKS_4" | "WEEKS_8"

export interface HourlyRow { date: string; hour: number; revenueIncGst: number; orders: number; source: string }
export interface DailyRow { date: string; revenueIncGst: number; orders: number | null }
export interface ChannelRow { date: string; channel: string; revenueIncGst: number; orders: number }

/** The same weekday on the previous 1, 4 or 8 weeks (most recent first). */
export function comparisonDates(date: string, mode: CompareMode): string[] {
  const n = mode === "LAST_WEEK" ? 1 : mode === "WEEKS_4" ? 4 : 8
  return Array.from({ length: n }, (_, i) => shiftDate(date, -7 * (i + 1)))
}

export interface HourlyComparison {
  /** Average revenue per hour across the comparison days that have data. */
  avgHourly: number[]
  /** Average full-day total across those days. */
  avgDay: number | null
  /** Average cumulative revenue up to `nowHour` + fraction of that hour. */
  avgToNow: number | null
  daysUsed: number
  estimated: boolean // any ESTIMATE-source day in the mix
}

/**
 * `nowMinutes` = minutes since Brisbane midnight for "at this time of day";
 * pass null for a closed day (compare whole days).
 */
export function compareHourly(rows: HourlyRow[], dates: string[], nowMinutes: number | null): HourlyComparison {
  const byDate = new Map<string, HourlyRow[]>()
  for (const r of rows) if (dates.includes(r.date)) (byDate.get(r.date) ?? byDate.set(r.date, []).get(r.date)!).push(r)
  const used = dates.filter((d) => byDate.has(d))
  const avgHourly = new Array(24).fill(0) as number[]
  let dayTotals = 0, toNow = 0, estimated = false
  for (const d of used) {
    const hrs = byDate.get(d)!
    for (const h of hrs) {
      avgHourly[h.hour] += h.revenueIncGst / used.length
      dayTotals += h.revenueIncGst
      if (h.source === "ESTIMATE") estimated = true
      if (nowMinutes !== null) {
        const hourStart = h.hour * 60
        if (hourStart + 60 <= nowMinutes) toNow += h.revenueIncGst
        else if (hourStart < nowMinutes) toNow += h.revenueIncGst * ((nowMinutes - hourStart) / 60)
      } else toNow += h.revenueIncGst
    }
  }
  const n = used.length
  return {
    avgHourly: avgHourly.map((v) => Math.round(v * 100) / 100),
    avgDay: n ? Math.round((dayTotals / n) * 100) / 100 : null,
    avgToNow: n ? Math.round((toNow / n) * 100) / 100 : null,
    daysUsed: n,
    estimated,
  }
}

export interface HeadlineComparison {
  vsAvgPct: number | null
  vsAvgDollars: number | null
  vsAvgNoSurchargePct: number | null
  onPaceFor: number | null
  /** Change vs the most recent comparison day (last same weekday) at this time. */
  vsLastWeekPct: number | null
  vsLastWeekDollars: number | null
}

export function headline(
  todayPaid: number,
  todaySurcharge: number,
  cmp: HourlyComparison,
  lastWeek: HourlyComparison
): HeadlineComparison {
  const vsAvgPct = pctChange(todayPaid, cmp.avgToNow)
  const vsAvgDollars = cmp.avgToNow !== null ? Math.round((todayPaid - cmp.avgToNow) * 100) / 100 : null
  const vsAvgNoSurchargePct = pctChange(todayPaid - todaySurcharge, cmp.avgToNow)
  let onPaceFor: number | null = null
  if (cmp.avgDay && cmp.avgToNow && cmp.avgToNow > 0) {
    const share = cmp.avgToNow / cmp.avgDay
    if (share > 0.05) onPaceFor = Math.round((todayPaid / share) / 100) * 100
  }
  return {
    vsAvgPct, vsAvgDollars, vsAvgNoSurchargePct, onPaceFor,
    vsLastWeekPct: pctChange(todayPaid, lastWeek.avgToNow),
    vsLastWeekDollars: lastWeek.avgToNow !== null ? Math.round((todayPaid - lastWeek.avgToNow) * 100) / 100 : null,
  }
}

export interface ChannelTypical { channel: string; typicalSharePct: number | null; typicalAvgSale: number | null }

/** Typical share and avg sale per channel over the comparison days. */
export function typicalChannels(rows: ChannelRow[], dates: string[]): ChannelTypical[] {
  const inRange = rows.filter((r) => dates.includes(r.date) && r.channel !== "OTHER")
  const total = inRange.reduce((s, r) => s + r.revenueIncGst, 0)
  const by = new Map<string, { rev: number; n: number }>()
  for (const r of inRange) { const a = by.get(r.channel) ?? { rev: 0, n: 0 }; a.rev += r.revenueIncGst; a.n += r.orders; by.set(r.channel, a) }
  return [...by.entries()].map(([channel, a]) => ({
    channel,
    typicalSharePct: total > 0 ? Math.round((a.rev / total) * 1000) / 10 : null,
    typicalAvgSale: a.n > 0 ? Math.round((a.rev / a.n) * 100) / 100 : null,
  }))
}

/** Daily series for 1W / 1M views: each day's total and the comparison average for that weekday. */
export function dailySeries(daily: DailyRow[], days: string[], mode: CompareMode): Array<{ date: string; actual: number | null; compare: number | null }> {
  const byDate = new Map(daily.map((d) => [d.date, d]))
  return days.map((date) => {
    const cmpDates = comparisonDates(date, mode).filter((d) => byDate.has(d))
    const compare = cmpDates.length ? Math.round((cmpDates.reduce((s, d) => s + byDate.get(d)!.revenueIncGst, 0) / cmpDates.length) * 100) / 100 : null
    return { date, actual: byDate.get(date)?.revenueIncGst ?? null, compare }
  })
}

/** Minutes since Brisbane midnight for an instant, and the Brisbane date. */
export function brisbaneNow(now = new Date()): { date: string; minutes: number } {
  const t = new Date(now.getTime() + 10 * 3600e3)
  return { date: t.toISOString().slice(0, 10), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() }
}
