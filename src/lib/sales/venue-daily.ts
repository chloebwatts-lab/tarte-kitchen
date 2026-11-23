/**
 * One venue's daily sales, the basics (Chloe, 23 Nov 2026: Vinicius gets
 * Burleigh's daily sales, "basics are fine for him"). Pure maths over
 * DailySalesSummary: net sales ex GST, paid orders only, the same figure as
 * Square's "Net sales" (Burleigh's open orders never count, see
 * src/lib/sales/insights.ts). Dates are AEST calendar dates as YYYY-MM-DD.
 * A day with no row had nothing rung up: it shows as absent, never as $0.
 */

import { pctChange, shiftDate, tarteWeekStart } from "@/lib/sales/compare"

export interface VenueDayIn {
  date: string
  exGst: number
  orders: number | null
}

export interface VenueDay {
  date: string
  isToday: boolean
  total: number | null
  orders: number | null
  /** The same weekday a week earlier, full day. */
  lastWeek: number | null
  /** Only for finished days: today so far against a full day misleads. */
  vsLastWeekPct: number | null
}

export interface VenueDaily {
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
  days: VenueDay[]
}

const r0 = (n: number) => Math.round(n)

export function buildVenueDaily(rows: VenueDayIn[], today: string, dayCount = 14): VenueDaily {
  const byDay = new Map<string, { total: number; orders: number | null }>()
  for (const r of rows) {
    const d = byDay.get(r.date) ?? { total: 0, orders: null }
    d.total += r.exGst
    if (r.orders != null) d.orders = (d.orders ?? 0) + r.orders
    byDay.set(r.date, d)
  }
  const totalOn = (date: string): number | null => byDay.get(date)?.total ?? null

  const days: VenueDay[] = []
  for (let i = 0; i < dayCount; i++) {
    const date = shiftDate(today, -i)
    const total = totalOn(date)
    const lastWeek = totalOn(shiftDate(date, -7))
    const isToday = i === 0
    days.push({
      date,
      isToday,
      total: total != null ? r0(total) : null,
      orders: byDay.get(date)?.orders ?? null,
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

  return {
    today,
    todaySoFar: days[0].total,
    todayOrders: days[0].orders,
    sameDayLastWeek: days[0].lastWeek,
    weekDone: r0(weekDone),
    weekDoneDays,
    lastWeekSameDays: lastWeekSameDays != null ? r0(lastWeekSameDays) : null,
    weekVsLastWeekPct: weekDoneDays > 0 ? pctChange(weekDone, lastWeekSameDays) : null,
    lastWeekTotal: lastWeekAny ? r0(lastWeekTotal) : null,
    days,
  }
}
