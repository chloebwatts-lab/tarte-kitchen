/**
 * Currumbin daily sales for Oliver's GM desk (/kitchen/gm/sales), Chloe and
 * Oliver 17 Nov 2026: he wants to keep up with Currumbin's daily sales
 * without a Square login. Pure maths over DailySalesSummary (net sales ex
 * GST, the same figure as Square's "Net sales") and DailyChannelSales (inc
 * GST, so channel splits are scaled to the ex GST total). Dates are AEST
 * calendar dates as YYYY-MM-DD. A venue with no row that day was closed or
 * had nothing rung up: it shows as absent, never as $0.
 */

import { pctChange, shiftDate, tarteWeekStart } from "@/lib/sales/compare"

export const CURRUMBIN_VENUES = ["BEACH_HOUSE", "TEA_GARDEN"] as const
export type CurrumbinVenue = (typeof CURRUMBIN_VENUES)[number]

export interface SummaryIn {
  date: string
  venue: string
  exGst: number
  orders: number | null
}

export interface ChannelIn {
  date: string
  venue: string
  channel: string
  incGst: number
}

export interface SalesDay {
  date: string
  isToday: boolean
  beachHouse: number | null
  teaGarden: number | null
  total: number | null
  orders: number | null
  /** The same weekday a week earlier, full day. */
  lastWeek: number | null
  /** Only for finished days: today so far against a full day misleads. */
  vsLastWeekPct: number | null
}

export interface ChannelSplit {
  date: string
  isToday: boolean
  lines: { label: string; amount: number }[]
}

export interface CurrumbinSales {
  today: string
  todaySoFar: number | null
  todayOrders: number | null
  /** The same weekday last week, full day, to read today against. */
  sameDayLastWeek: number | null
  /** Finished days of this trading week (Wed to yesterday). */
  weekDone: number
  weekDoneDays: number
  /** The same finished days last week. */
  lastWeekSameDays: number | null
  weekVsLastWeekPct: number | null
  /** Last trading week, Wed to Tue. */
  lastWeekTotal: number | null
  days: SalesDay[]
  splits: ChannelSplit[]
}

const LINE_LABEL: Record<string, string> = {
  CAFE: "Beach House cafe",
  RESTAURANT: "Beach House restaurant",
  ONLINE: "Beach House online",
  OTHER: "Beach House other",
  TEA_GARDEN: "Tea Garden",
}
const CHANNEL_ORDER = ["CAFE", "RESTAURANT", "ONLINE", "OTHER"]

const r0 = (n: number) => Math.round(n)

function isCurrumbin(v: string): v is CurrumbinVenue {
  return (CURRUMBIN_VENUES as readonly string[]).includes(v)
}

export function buildCurrumbinSales(summaries: SummaryIn[], channels: ChannelIn[], today: string, dayCount = 14): CurrumbinSales {
  const byDay = new Map<string, { bh: number | null; tg: number | null; orders: number | null }>()
  for (const s of summaries) {
    if (!isCurrumbin(s.venue)) continue
    const d = byDay.get(s.date) ?? { bh: null, tg: null, orders: null }
    if (s.venue === "BEACH_HOUSE") d.bh = (d.bh ?? 0) + s.exGst
    else d.tg = (d.tg ?? 0) + s.exGst
    if (s.orders != null) d.orders = (d.orders ?? 0) + s.orders
    byDay.set(s.date, d)
  }
  const totalOn = (date: string): number | null => {
    const d = byDay.get(date)
    if (!d || (d.bh == null && d.tg == null)) return null
    return (d.bh ?? 0) + (d.tg ?? 0)
  }

  const days: SalesDay[] = []
  for (let i = 0; i < dayCount; i++) {
    const date = shiftDate(today, -i)
    const d = byDay.get(date)
    const total = totalOn(date)
    const lastWeek = totalOn(shiftDate(date, -7))
    const isToday = i === 0
    days.push({
      date,
      isToday,
      beachHouse: d?.bh != null ? r0(d.bh) : null,
      teaGarden: d?.tg != null ? r0(d.tg) : null,
      total: total != null ? r0(total) : null,
      orders: d?.orders ?? null,
      lastWeek: lastWeek != null ? r0(lastWeek) : null,
      vsLastWeekPct: !isToday && total != null ? pctChange(total, lastWeek) : null,
    })
  }

  // This trading week's finished days (Wed to yesterday) against the same
  // days last week. Today is left out: it is still trading.
  const wed = tarteWeekStart(today)
  let weekDone = 0
  let weekDoneDays = 0
  let lastSame = 0
  let lastSameAny = false
  for (let date = wed; date < today; date = shiftDate(date, 1)) {
    const t = totalOn(date)
    if (t != null) {
      weekDone += t
      weekDoneDays++
    }
    const lw = totalOn(shiftDate(date, -7))
    if (lw != null) {
      lastSame += lw
      lastSameAny = true
    }
  }
  const lastWeekSameDays = weekDoneDays > 0 && lastSameAny ? lastSame : null

  let lastWeekTotal = 0
  let lastWeekAny = false
  for (let i = 0; i < 7; i++) {
    const t = totalOn(shiftDate(wed, -7 + i))
    if (t != null) {
      lastWeekTotal += t
      lastWeekAny = true
    }
  }

  // Where the money came from, today and yesterday. Channel rows are inc GST;
  // scale them so they add up to the ex GST total shown above them.
  const splits: ChannelSplit[] = []
  for (const date of [today, shiftDate(today, -1)]) {
    const total = totalOn(date)
    const rows = channels.filter((c) => c.date === date && isCurrumbin(c.venue))
    const incTotal = rows.reduce((a, c) => a + c.incGst, 0)
    if (total == null || rows.length === 0 || incTotal <= 0) continue
    const sums = new Map<string, number>()
    for (const c of rows) {
      const key = c.venue === "TEA_GARDEN" ? "TEA_GARDEN" : CHANNEL_ORDER.includes(c.channel) ? c.channel : "OTHER"
      sums.set(key, (sums.get(key) ?? 0) + c.incGst)
    }
    const lines = [...CHANNEL_ORDER, "TEA_GARDEN"]
      .filter((k) => (sums.get(k) ?? 0) !== 0)
      .map((k) => ({ label: LINE_LABEL[k], amount: r0(((sums.get(k) ?? 0) / incTotal) * total) }))
    splits.push({ date, isToday: date === today, lines })
  }

  const todayRow = days[0]
  return {
    today,
    todaySoFar: todayRow.total,
    todayOrders: todayRow.orders,
    sameDayLastWeek: todayRow.lastWeek,
    weekDone: r0(weekDone),
    weekDoneDays,
    lastWeekSameDays: lastWeekSameDays != null ? r0(lastWeekSameDays) : null,
    weekVsLastWeekPct: lastWeekSameDays != null ? pctChange(weekDone, lastWeekSameDays) : null,
    lastWeekTotal: lastWeekAny ? r0(lastWeekTotal) : null,
    days,
    splits,
  }
}
