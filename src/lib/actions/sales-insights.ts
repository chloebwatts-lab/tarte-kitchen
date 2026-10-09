"use server"

import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { isSquareVenueOn } from "@/lib/pos"
import { assertManager } from "@/lib/manager-auth"
import { fetchLiveDay } from "@/lib/square/live"
import { uberDay, uberDailyRows, type UberDay } from "@/lib/uber/live"
import type { DayBreakdown, Channel } from "@/lib/square/breakdown"
import { shiftDate, tarteWeekStart } from "@/lib/sales/compare"
import {
  brisbaneNow, comparisonDates, compareHourly, fillMissingHourly, headline, typicalChannels, dailySeries,
  type CompareMode, type HourlyComparison, type HeadlineComparison, type ChannelTypical,
} from "@/lib/sales/insights"

export type Range = "1D" | "1W" | "1M"

export interface SalesInsights {
  venue: Venue
  date: string
  isToday: boolean
  range: Range
  compare: CompareMode
  /** LIVE = Square right now, SQUARE = closed Square day, LIGHTSPEED/ESTIMATE = history, NONE = no data. */
  source: "LIVE" | "SQUARE" | "LIGHTSPEED" | "ESTIMATE" | "NONE"
  fetchedAt: string | null
  day: DayBreakdown | null
  hourlyCompare: HourlyComparison
  lastWeek: HourlyComparison
  head: HeadlineComparison
  typical: ChannelTypical[]
  /** For 1W / 1M: one entry per day. `uber` is Uber Eats, shown beside the total, never in it. */
  series: Array<{ date: string; actual: number | null; compare: number | null; uber: number | null }>
  seriesTotals: { actual: number; compare: number | null; pct: number | null; uber: number | null }
  nowMinutes: number | null
  /** Uber Eats for the day (menu value inc GST, before commission). Not part of `day`. */
  uber: UberDay
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)

async function historicalDay(venue: Venue, date: string): Promise<{ day: DayBreakdown; source: SalesInsights["source"] } | null> {
  const d = new Date(date)
  const [summary, hourly, channels] = await Promise.all([
    db.dailySalesSummary.findUnique({ where: { date_venue: { date: d, venue } } }),
    db.hourlySales.findMany({ where: { date: d, venue } }),
    db.dailyChannelSales.findMany({ where: { date: d, venue } }),
  ])
  if (!summary && hourly.length === 0) return null
  const paid = summary ? Number(summary.totalRevenue) : hourly.reduce((s, h) => s + Number(h.revenueIncGst), 0)
  const hours = new Array(24).fill(0) as number[]
  const hourOrders = new Array(24).fill(0) as number[]
  for (const h of hourly) { hours[h.hour] = Number(h.revenueIncGst); hourOrders[h.hour] = h.orders }
  const ch: DayBreakdown["channels"] = { CAFE: { sales: 0, orders: 0 }, RESTAURANT: { sales: 0, orders: 0 }, ONLINE: { sales: 0, orders: 0 }, OTHER: { sales: 0, orders: 0 } }
  for (const c of channels) if (c.channel in ch) ch[c.channel as Channel] = { sales: Number(c.revenueIncGst), orders: c.orders }
  const orders = summary?.totalOrders ?? channels.reduce((s, c) => s + c.orders, 0)
  const src = hourly.some((h) => h.source === "SQUARE") ? "SQUARE" : hourly.some((h) => h.source === "ESTIMATE") ? "ESTIMATE" : "LIGHTSPEED"
  return {
    source: src,
    day: {
      date, paidIncGst: Math.round(paid * 100) / 100, openTablesIncGst: 0, openTables: 0, paidOrders: orders,
      avgTransaction: orders ? Math.round((paid / orders) * 100) / 100 : 0,
      surchargeIncGst: summary?.surchargeIncGst ? Number(summary.surchargeIncGst) : 0, surchargeName: null, tipsIncGst: 0,
      hourly: hours, hourlyOrders: hourOrders, channels: ch, registers: [], staff: [], staffChannels: [], groups: [], unmatchedPayments: 0,
    },
  }
}

export async function getSalesInsights(venue: Venue, date: string, range: Range = "1D", compare: CompareMode = "WEEKS_4", opts: { force?: boolean } = {}): Promise<SalesInsights> {
  await assertManager()
  const now = brisbaneNow()
  const isToday = date === now.date
  const nowMinutes = isToday ? now.minutes : null

  // ---- the day itself ----
  let day: DayBreakdown | null = null
  let source: SalesInsights["source"] = "NONE"
  let fetchedAt: string | null = null
  if (isSquareVenueOn(venue, date) && date <= now.date) {
    try {
      const live = await fetchLiveDay(venue, date, { force: opts.force })
      if (live) { day = live.breakdown; source = isToday ? "LIVE" : "SQUARE"; fetchedAt = live.fetchedAt }
    } catch (err) {
      console.error("[sales-insights] live fetch failed", err)
    }
  }
  if (!day) {
    const h = await historicalDay(venue, date)
    if (h) { day = h.day; source = h.source }
  }

  // ---- Uber Eats (beside the total, never in it) ----
  const uber = await uberDay(venue, date, isToday, { force: opts.force })

  // ---- comparisons ----
  const cmpDates = comparisonDates(date, compare)
  const lwDates = comparisonDates(date, "LAST_WEEK")
  const wanted = [...new Set([...cmpDates, ...lwDates])]
  // Same weekday over 12 weeks: the comparison days plus a shape to borrow
  // for any of them that has a day total but no hourly rows.
  const shapeDates = Array.from({ length: 12 }, (_, i) => shiftDate(date, -7 * (i + 1)))
  const [hourlyRows, channelRows, totalRows] = await Promise.all([
    db.hourlySales.findMany({ where: { venue, date: { in: shapeDates.map((d) => new Date(d)) } } }),
    db.dailyChannelSales.findMany({ where: { venue, date: { in: wanted.map((d) => new Date(d)) } } }),
    db.dailySalesSummary.findMany({ where: { venue, date: { in: wanted.map((d) => new Date(d)) } }, select: { date: true, totalRevenue: true, totalOrders: true } }),
  ])
  const stored = hourlyRows.map((r) => ({ date: ymd(r.date), hour: r.hour, revenueIncGst: Number(r.revenueIncGst), orders: r.orders, source: r.source }))
  const totals = totalRows.map((r) => ({ date: ymd(r.date), revenueIncGst: Number(r.totalRevenue), orders: r.totalOrders }))
  const hr = fillMissingHourly(stored.filter((r) => wanted.includes(r.date)), wanted, totals, stored)
  const cr = channelRows.map((r) => ({ date: ymd(r.date), channel: r.channel, revenueIncGst: Number(r.revenueIncGst), orders: r.orders }))
  const hourlyCompare = compareHourly(hr, cmpDates, nowMinutes)
  const lastWeek = compareHourly(hr, lwDates, nowMinutes)
  const head = headline(day?.paidIncGst ?? 0, day?.surchargeIncGst ?? 0, hourlyCompare, lastWeek)
  const typical = typicalChannels(cr, cmpDates)

  // ---- 1W / 1M daily series ----
  let series: SalesInsights["series"] = []
  let seriesTotals = { actual: 0, compare: null as number | null, pct: null as number | null, uber: null as number | null }
  if (range !== "1D") {
    const start = range === "1W" ? tarteWeekStart(date) : shiftDate(tarteWeekStart(date), -21)
    const days = Array.from({ length: range === "1W" ? 7 : 28 }, (_, i) => shiftDate(start, i))
    const weeksBack = compare === "LAST_WEEK" ? 1 : compare === "WEEKS_4" ? 4 : 8
    const from = new Date(shiftDate(start, -7 * weeksBack))
    const to = new Date(days[days.length - 1])
    const rows = await db.dailySalesSummary.findMany({ where: { venue, date: { gte: from, lte: to } }, select: { date: true, totalRevenue: true, totalOrders: true } })
    const daily = rows.map((r) => ({ date: ymd(r.date), revenueIncGst: Number(r.totalRevenue), orders: r.totalOrders }))
    // Today's row in the summary table lags the live view; patch it in.
    if (day && isToday) {
      const i = daily.findIndex((r) => r.date === date)
      if (i >= 0) daily[i] = { ...daily[i], revenueIncGst: day.paidIncGst }
      else daily.push({ date, revenueIncGst: day.paidIncGst, orders: day.paidOrders })
    }
    const uberRows = await uberDailyRows(venue, days[0], days[days.length - 1])
    const uberBy = new Map(uberRows.map((r) => [r.date, r.sales]))
    if (isToday && uber.status !== "NONE") uberBy.set(date, uber.sales)
    series = dailySeries(daily, days.filter((d) => d <= now.date), compare).map((x) => ({ ...x, uber: uberBy.has(x.date) ? uberBy.get(x.date)! : null }))
    const actual = series.reduce((s, x) => s + (x.actual ?? 0), 0)
    const cmpVals = series.filter((x) => x.actual !== null && x.compare !== null)
    const cmpSum = cmpVals.reduce((s, x) => s + (x.compare ?? 0), 0)
    const pct = cmpSum > 0 ? Math.round(((actual - cmpSum) / cmpSum) * 1000) / 10 : null
    const uberSum = series.reduce((s, x) => s + (x.uber ?? 0), 0)
    seriesTotals = { actual: Math.round(actual * 100) / 100, compare: cmpVals.length ? Math.round(cmpSum * 100) / 100 : null, pct, uber: series.some((x) => x.uber !== null) ? Math.round(uberSum * 100) / 100 : null }
  }

  return { venue, date, isToday, range, compare, source, fetchedAt, day, hourlyCompare, lastWeek, head, typical, series, seriesTotals, nowMinutes, uber }
}
