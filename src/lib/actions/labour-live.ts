"use server"

import { db } from "@/lib/db"
import { currentTarteWeekRange, tarteWeekLabel, startOfTarteWeekUtc } from "@/lib/dates"
import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"
import {
  bucketFor,
  bucketStatus,
  bucketTargets,
  type Bucket,
  type BucketTarget,
} from "@/lib/labour/buckets"
import type { Venue } from "@/generated/prisma"

export interface LiveBucketRow {
  key: Bucket
  label: string
  target: BucketTarget | null
  /** Locked + accruing labour $ for the bucket so far this week. */
  spentToDate: number
  /** Locked + accruing + remaining-roster forecast. */
  projectedTotal: number
  /** Sales-weighted % vs venue revenue projection. */
  projectedPct: number | null
  status: "ok" | "amber" | "red" | "no-target"
  varianceVsBandPct: number | null
}

export interface LiveVenueSnapshot {
  venue: Venue
  label: string
  /** Labour: actuals to date (timesheet) + accruing for in-progress shifts. */
  labourToDate: number
  /** Labour: full-week projection = actuals so far + rest-of-week roster. */
  labourProjected: number
  /** Revenue: locked daily totals Wed → yesterday. */
  revenueToDate: number
  /** Revenue: + today's running total + forecast for remaining days. */
  revenueProjected: number
  /** Headline = labourProjected / revenueProjected × 100. */
  overallProjectedPct: number | null
  buckets: LiveBucketRow[]
  /** Diagnostic: how much of the projection is real vs forecast. */
  coverage: {
    daysLocked: number // Wed → yesterday in AEST
    daysRemaining: number
    asOf: string // ISO instant the snapshot was built
  }
}

export interface LiveSnapshot {
  weekLabel: string
  weekStart: string // YYYY-MM-DD AEST Wed
  weekEnd: string // YYYY-MM-DD AEST Tue
  venues: LiveVenueSnapshot[]
}

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000

/** Today's AEST yyyy-mm-dd at the moment of the call. */
function aestDateKey(now: Date): string {
  return new Date(now.getTime() + AEST_OFFSET_MS).toISOString().split("T")[0]
}

export async function getLiveLabourSnapshot(): Promise<LiveSnapshot> {
  const now = new Date()
  const { start: weekStart, end: weekEnd } = currentTarteWeekRange(now)
  const todayAest = aestDateKey(now)

  // Day-of-week revenue history: pull the prior 4 Tarte weeks so we can
  // forecast each remaining day from its actual same-DOW history rather
  // than the naive `× 7/days_locked` average that overstates Mon + Tue
  // by treating them like Sat + Sun.
  const historyStart = new Date(weekStart)
  historyStart.setUTCDate(historyStart.getUTCDate() - 28)

  // Pull everything for the week in a few targeted queries.
  const [labourShifts, salesSummaries, forecasts, history, connection] =
    await Promise.all([
      db.labourShift.findMany({
        where: {
          shiftStart: { gte: weekStart, lt: weekEnd },
        },
        select: {
          venue: true,
          area: true,
          cost: true,
          source: true,
          shiftStart: true,
          shiftEnd: true,
        },
      }),
      db.dailySalesSummary.findMany({
        where: { date: { gte: weekStart, lt: weekEnd } },
        select: { venue: true, date: true, totalRevenueExGst: true },
      }),
      db.managerSalesForecast.findMany({
        where: { weekStartWed: weekStart },
        select: { venue: true, amount: true },
      }),
      db.dailySalesSummary.findMany({
        where: { date: { gte: historyStart, lt: weekStart } },
        select: { venue: true, date: true, totalRevenueExGst: true },
      }),
      db.deputyConnection.findFirst({
        select: { superRate: true, onCostUpliftRate: true },
      }),
    ])

  // Labour multiplier: Deputy's raw Cost excludes super + workers'-comp
  // /payroll tax. Louise's PDF (the source of truth we project toward)
  // does include them. Apply both rates from DeputyConnection so the
  // live projection lands at gross-wages.
  const labourMultiplier =
    1 +
    Number(connection?.superRate ?? 0.12) +
    Number(connection?.onCostUpliftRate ?? 0)

  // Daily revenue map: key = "<venue>|<yyyy-mm-dd>" → $
  const revByDay = new Map<string, number>()
  for (const s of salesSummaries) {
    const key = `${s.venue}|${s.date.toISOString().split("T")[0]}`
    revByDay.set(key, Number(s.totalRevenueExGst))
  }

  // Build the 7-day list (Wed → Tue) in AEST yyyy-mm-dd form.
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    days.push(d.toISOString().split("T")[0])
  }
  const lockedDays = days.filter((d) => d < todayAest)
  const remainingDays = days.filter((d) => d > todayAest)
  // todayAest itself is "running" — locked-as-of-now revenue, plus
  // labour accruing per timesheet rows.

  const venues: LiveVenueSnapshot[] = SINGLE_VENUES.map((venue) => {
    // Labour-side aggregates.
    const venueShifts = labourShifts.filter((s) => s.venue === venue)
    let labourToDate = 0
    let labourRemaining = 0
    const bucketSpent: Record<Bucket, number> = {
      chefsKp: 0,
      fohBarista: 0,
      pastry: 0,
      other: 0,
    }
    const bucketRoster: Record<Bucket, number> = {
      chefsKp: 0,
      fohBarista: 0,
      pastry: 0,
      other: 0,
    }
    for (const s of venueShifts) {
      const bucket = bucketFor(venue, s.area)
      // Apply on-cost multiplier (super + workers' comp + payroll tax)
      // so the projection lines up with Louise's gross-wages PDF rather
      // than Deputy's raw scheduled-cost figure.
      const cost = Number(s.cost) * labourMultiplier
      if (s.source === "TIMESHEET") {
        labourToDate += cost
        bucketSpent[bucket] += cost
      } else {
        // ROSTER rows: two reasons to include in the projection.
        //   1. Shift hasn't started yet — it's genuinely "remaining".
        //   2. Salary X placeholder — represents a weekly fixed cost
        //      that doesn't have a matching Timesheet row, so without
        //      this we'd under-count by the salaried staff's wages.
        const isSalaryPlaceholder = s.area?.toLowerCase().startsWith("salary") ?? false
        const isFuture = s.shiftStart.getTime() > now.getTime()
        if (isFuture || isSalaryPlaceholder) {
          labourRemaining += cost
          bucketRoster[bucket] += cost
        }
      }
    }
    const labourProjected = labourToDate + labourRemaining

    // Revenue-side aggregates.
    const lockedRevenue = lockedDays.reduce(
      (sum, d) => sum + (revByDay.get(`${venue}|${d}`) ?? 0),
      0
    )
    const todayRevenue = revByDay.get(`${venue}|${todayAest}`) ?? 0
    const revenueToDate = lockedRevenue + todayRevenue

    // Forecast for the remaining days, in priority order:
    //   1. Day-of-week median from the prior 4 Tarte weeks — handles the
    //      Mon-and-Tue-are-slow-days reality. Best accuracy when we have
    //      historical data.
    //   2. Manager's Deputy forecast pro-rated equally — fallback when
    //      we don't have enough history.
    //   3. Average of locked days — last-resort fallback.
    const venueHistory = history.filter((h) => h.venue === venue)
    const historyByDow = new Map<number, number[]>()
    for (const h of venueHistory) {
      const dow = h.date.getUTCDay() // 0=Sun ... 6=Sat
      const arr = historyByDow.get(dow) ?? []
      arr.push(Number(h.totalRevenueExGst))
      historyByDow.set(dow, arr)
    }
    const median = (arr: number[]): number => {
      if (arr.length === 0) return 0
      const sorted = [...arr].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid]
    }

    let remainingForecast = 0
    let usingHistoryForecast = true
    for (const remainingDateStr of remainingDays) {
      const remDate = new Date(`${remainingDateStr}T00:00:00Z`)
      const dow = remDate.getUTCDay()
      const samples = historyByDow.get(dow) ?? []
      if (samples.length >= 2) {
        remainingForecast += median(samples)
      } else {
        // Lose the day-of-week per-venue history → fall back to manager's
        // forecast or locked-day average. We mark the whole flag for the
        // diagnostic but per-day fallback is fine.
        usingHistoryForecast = false
        const forecastRow = forecasts.find((f) => f.venue === venue)
        const weeklyForecast = forecastRow ? Number(forecastRow.amount) : null
        if (weeklyForecast && weeklyForecast > 0) {
          remainingForecast += weeklyForecast / 7
        } else if (lockedDays.length > 0) {
          remainingForecast += lockedRevenue / lockedDays.length
        }
      }
    }
    // Quiet the unused-warning when nothing fell through.
    void usingHistoryForecast
    const revenueProjected = revenueToDate + remainingForecast

    const overallProjectedPct =
      revenueProjected > 0 ? (labourProjected / revenueProjected) * 100 : null

    const targets = bucketTargets(venue)
    const buckets: LiveBucketRow[] = targets.map((t) => {
      const spent = bucketSpent[t.key]
      const roster = bucketRoster[t.key]
      const total = spent + roster
      const pct =
        revenueProjected > 0 ? (total / revenueProjected) * 100 : null
      const status = bucketStatus(pct, t)
      return {
        key: t.key,
        label: t.label,
        target: t,
        spentToDate: round2(spent),
        projectedTotal: round2(total),
        projectedPct: pct,
        status,
        varianceVsBandPct: pct == null ? null : pct - t.max,
      }
    })

    return {
      venue,
      label: VENUE_LABEL[venue],
      labourToDate: round2(labourToDate),
      labourProjected: round2(labourProjected),
      revenueToDate: round2(revenueToDate),
      revenueProjected: round2(revenueProjected),
      overallProjectedPct,
      buckets,
      coverage: {
        daysLocked: lockedDays.length,
        daysRemaining: remainingDays.length,
        asOf: now.toISOString(),
      },
    }
  })

  const weekKey = startOfTarteWeekUtc(now)
  const endKey = new Date(weekKey)
  endKey.setUTCDate(endKey.getUTCDate() + 6)
  return {
    weekLabel: tarteWeekLabel(weekKey),
    weekStart: weekKey.toISOString().split("T")[0],
    weekEnd: endKey.toISOString().split("T")[0],
    venues,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
