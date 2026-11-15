"use server"

import { db } from "@/lib/db"
import { currentTarteWeekRange } from "@/lib/dates"
import { aestDateKey, buildLiveLabourSnapshot, type LiveSnapshot } from "@/lib/labour/live"

export type { LiveBucketRow, LiveDayRow, LiveVenueSnapshot, LiveSnapshot } from "@/lib/labour/live"

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000

/**
 * Live wage % for the current trading week. Reads the rows, then
 * buildLiveLabourSnapshot (src/lib/labour/live.ts, pure and unit tested)
 * does the maths.
 */
export async function getLiveLabourSnapshot(
  options?: { now?: Date }
): Promise<LiveSnapshot> {
  const now = options?.now ?? new Date()
  const { start: weekStart, end: weekEnd } = currentTarteWeekRange(now)

  // LabourShift.shiftStart is a real UTC instant. weekStart / weekEnd are
  // UTC midnights whose calendar date matches the AEST Wed (the DB
  // convention used by DATE columns like weekStartWed). AEST Wed 00:00 is
  // actually UTC Tue 14:00: 10 hours earlier, so to filter shifts by
  // the trading day we need the instant-corrected bounds, otherwise we
  // both miss last week's early-AM Wed bakery shifts and sweep in this
  // week's Wed-morning roster as "future" labour for the prior week.
  const weekStartInstant = new Date(weekStart.getTime() - AEST_OFFSET_MS)
  const weekEndInstant = new Date(weekEnd.getTime() - AEST_OFFSET_MS)

  // Day-of-week revenue history: the prior 4 Tarte weeks, so each day still
  // to come is forecast from its own weekday, not a flat daily average.
  const historyStart = new Date(weekStart)
  historyStart.setUTCDate(historyStart.getUTCDate() - 28)

  // Today's weekday on the 4 weeks before, for the usual hour-by-hour
  // shape of the day (how much of today's takings is normally in by now).
  const todayKey = new Date(`${aestDateKey(now)}T00:00:00Z`)
  const sameWeekdays = [7, 14, 21, 28].map((n) => {
    const d = new Date(todayKey)
    d.setUTCDate(d.getUTCDate() - n)
    return d
  })

  const [labourShifts, posRows, uberRows, eventRows, forecasts, connection, hourlyRows] =
    await Promise.all([
      db.labourShift.findMany({
        where: { shiftStart: { gte: weekStartInstant, lt: weekEndInstant } },
        select: { venue: true, area: true, cost: true, source: true, shiftStart: true, shiftEnd: true },
      }),
      // This week and the 4 weeks of history in one go, tills + Uber +
      // Xero events (all revenue, Chloe 12 Nov 2026).
      db.dailySalesSummary.findMany({
        where: { date: { gte: historyStart, lt: weekEnd } },
        select: { venue: true, date: true, totalRevenueExGst: true, source: true },
      }),
      db.dailyUberSales.findMany({
        where: { date: { gte: historyStart, lt: weekEnd } },
        select: { venue: true, date: true, salesIncGst: true },
      }),
      db.dailyEventSales.findMany({
        where: { date: { gte: historyStart, lt: weekEnd } },
        select: { venue: true, date: true, exGst: true },
      }),
      db.managerSalesForecast.findMany({
        where: { weekStartWed: weekStart },
        select: { venue: true, amount: true },
      }),
      db.deputyConnection.findFirst({
        select: { superRate: true, onCostUpliftRate: true },
      }),
      db.hourlySales.findMany({
        where: { date: { in: sameWeekdays } },
        select: { venue: true, date: true, hour: true, revenueIncGst: true },
      }),
    ])

  // Labour multiplier: the raw shift cost excludes super + workers' comp /
  // payroll tax. The weekly wage figure we project toward (the Xero pay
  // runs, src/lib/labour/payweek-figures.ts) includes them. Rates from DeputyConnection, as before.
  const labourMultiplier =
    1 +
    Number(connection?.superRate ?? 0.12) +
    Number(connection?.onCostUpliftRate ?? 0)

  const iso = (d: Date) => d.toISOString().split("T")[0]
  return buildLiveLabourSnapshot(
    {
      labourShifts: labourShifts.map((s) => ({
        venue: s.venue,
        area: s.area,
        cost: Number(s.cost),
        source: s.source,
        shiftStart: s.shiftStart,
        shiftEnd: s.shiftEnd,
      })),
      pos: posRows.map((r) => ({ date: iso(r.date), venue: r.venue, exGst: Number(r.totalRevenueExGst), source: r.source })),
      uber: uberRows.map((r) => ({ date: iso(r.date), venue: r.venue, salesIncGst: Number(r.salesIncGst) })),
      events: eventRows.map((r) => ({ date: iso(r.date), venue: r.venue, exGst: Number(r.exGst) })),
      forecasts: forecasts.map((f) => ({ venue: f.venue, amount: Number(f.amount) })),
      hourlyHistory: hourlyRows.map((h) => ({ date: iso(h.date), venue: h.venue, hour: h.hour, revenueIncGst: Number(h.revenueIncGst) })),
      labourMultiplier,
    },
    now
  )
}
