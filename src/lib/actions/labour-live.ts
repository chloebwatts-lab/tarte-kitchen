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

  // Pull everything for the week in a few targeted queries.
  const [labourShifts, salesSummaries, forecasts] = await Promise.all([
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
  ])

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
      const cost = Number(s.cost)
      if (s.source === "TIMESHEET") {
        labourToDate += cost
        bucketSpent[bucket] += cost
      } else {
        // ROSTER row — only counts toward the "remaining" projection
        // for shifts that start in the future. Past rostered shifts
        // are already covered by their TIMESHEET row.
        if (s.shiftStart.getTime() > now.getTime()) {
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

    // Forecast for the remaining days: pro-rate the manager's weekly
    // forecast by remaining-day count. Falls back to extrapolating
    // from the average locked-day revenue if no forecast exists.
    const forecastRow = forecasts.find((f) => f.venue === venue)
    const weeklyForecast = forecastRow ? Number(forecastRow.amount) : null
    let remainingForecast = 0
    if (weeklyForecast && weeklyForecast > 0) {
      const dailyForecast = weeklyForecast / 7
      remainingForecast = dailyForecast * remainingDays.length
    } else if (lockedDays.length > 0) {
      const avgLocked = lockedRevenue / lockedDays.length
      remainingForecast = avgLocked * remainingDays.length
    }
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
