/**
 * The live wage % snapshot, built from rows already read from the database.
 * Pure (no DB, clock passed in) so /labour/live, the GM desk and the
 * Wages + COGS page (/kitchen/managers/numbers) run the same code as the
 * tests. The reads are in src/lib/actions/labour-live.ts.
 *
 * Three reads per venue, most certain first:
 *
 *   locked     Wed to yesterday, actual against actual: clocked timesheets
 *              plus that day's salary, over all revenue for the same days.
 *              Nothing forecast in it.
 *   today      wages clocked and takings so far today.
 *   projected  the full week: locked + today + what is still to come.
 *
 * Today is counted as a whole day on both sides (15 Nov 2026). Before that,
 * a part-day of takings stood in for the whole day while most of the day's
 * wages were already in (afternoon shifts counted from the roster), so the
 * projected % read high every morning and drifted down by close. Now:
 *   - revenue: takings so far + the usual rest of the day (this weekday's
 *     median at this week's trade, times the share of the day's takings
 *     that normally lands after this time of day, off HourlySales);
 *   - wages: clocked so far + shifts not started + the part still to run of
 *     the rostered shifts that are underway.
 *
 * Paid leave (15 Nov 2026). Chloe: Burleigh "shouldn't be that high". It
 * read 41.2% with two department heads away all week on approved leave,
 * their full salaries (3.3 points) inside it. A salaried person away the
 * whole week is still paid, but it is not a cost of running the roster, so
 * the Shifts feed marks it and every figure here now comes two ways: the
 * existing fields are unchanged (leave in), and the `working` ones leave it
 * out. Wages are gross plus super only: no WorkCover, payroll tax or admin.
 */

import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"
import { currentTarteWeekRange, startOfTarteWeekUtc, tarteWeekLabel } from "@/lib/dates"
import { compareSales } from "@/lib/sales/compare"
import { allRevenueByDay } from "@/lib/sales/all-revenue"
import { bucketFor, bucketStatus, bucketTargets, type Bucket, type BucketTarget } from "@/lib/labour/buckets"
import type { Venue } from "@/generated/prisma/client"

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
  /** Paid leave inside projectedTotal (salaried, away all week). */
  paidLeave: number
  /** The same three without the paid leave: what the band is judged on. */
  workingPct: number | null
  workingStatus: "ok" | "amber" | "red" | "no-target"
  workingVarianceVsBandPct: number | null
  /** Hourly roster still to run in this department (rest of shifts underway
   *  + shifts not started, today to Tuesday): what a manager can still trim.
   *  Salaries are not in it. */
  rosterStillToRun: number
}

export interface LiveDayRow {
  /** AEST yyyy-mm-dd */
  date: string
  dayName: string
  /**
   * locked: a finished day, actual wages on actual revenue.
   * today:  wages for the whole day (clocked + salary + still to run) on
   *         the takings so far, so the % starts high and falls as the
   *         tills fill; by mid afternoon it is close to where the day lands.
   * ahead:  rostered wages + salary on the forecast takings.
   */
  state: "locked" | "today" | "ahead"
  /** On-costs included. */
  labour: number
  /** Today only: the part of `labour` already clocked (plus today's salary). */
  labourSoFar?: number
  /** Ex GST. Actual for locked, so far for today, forecast for ahead. */
  revenue: number
  pct: number | null
  /** Paid leave inside `labour` that day. */
  paidLeave: number
  /** (labour - paidLeave) / revenue. */
  workingPct: number | null
}

export interface LiveVenueSnapshot {
  venue: Venue
  label: string
  /** Labour: actuals to date (timesheet) + accruing for in-progress shifts. */
  labourToDate: number
  /** Labour: full-week projection = actuals so far + rest-of-week roster + salaries. */
  labourProjected: number
  /** Revenue: locked daily totals Wed → yesterday + today so far (tills + Uber + Xero events, ex GST). */
  revenueToDate: number
  /** Revenue: + the rest of today + forecast for remaining days. */
  revenueProjected: number
  /** Same Wed-to-today span last week (null when no rows). */
  revenueLastWeekSameDays: number | null
  revenueVsLastWeekPct: number | null
  /** Last week's full Wed-to-Tue revenue. */
  revenueLastWeekTotal: number | null
  /** labourProjected / revenueProjected × 100, paid leave in. */
  overallProjectedPct: number | null
  /** Paid leave inside labourProjected: salaried people away the whole week on approved time off. */
  paidLeave: number
  /** Headline: (labourProjected - paidLeave) / revenueProjected × 100. */
  workingProjectedPct: number | null
  /** Wed to yesterday, actual wages over actual revenue. Null on a Wednesday. */
  locked: {
    /** Clocked timesheets + salary for the completed days, on-costs included. */
    labour: number
    revenue: number
    pct: number | null
    days: number
    /** Paid leave inside `labour`, and the % without it. */
    paidLeave: number
    workingPct: number | null
  }
  today: {
    /** True while today's till figure is the intraday one (still trading). */
    live: boolean
    /** Wages clocked today so far, on-costs included, salaries excluded. */
    labourSoFar: number
    revenueSoFar: number
    /** Usual share of this weekday's takings in by now (0 to 1), null with no hourly history. */
    shareOfDayDone: number | null
    /** Takings the projection adds for the rest of today. */
    revenueRestOfDay: number
    /** Wages the projection adds for the rest of today (underway + not started). */
    labourRestOfDay: number
  }
  /** Hourly roster still to run, today to Tuesday, on-costs in, salaries
   *  out: the wages a manager can still trim this week. */
  rosterStillToRun: number
  /** Takings the projection still expects: the rest of today + the days ahead. */
  revenueStillToCome: number
  /** Wed to Tue, one row a day (Chloe, 15 Nov 2026: wages day by day). */
  days: LiveDayRow[]
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

/** The rows getLiveLabourSnapshot reads, numbers already unwrapped. */
export interface LiveLabourRows {
  /** LabourShift rows whose shiftStart is inside the trading week. */
  labourShifts: Array<{ venue: Venue; area: string | null; cost: number; source: string; shiftStart: Date; shiftEnd: Date; /** A salary row that is paid leave. */ leave?: boolean }>
  /** Till rows, this week and the 4 weeks before. `source` API on today's row = intraday. */
  pos: Array<{ date: string; venue: Venue; exGst: number; source?: "API" | "EMAIL" }>
  uber: Array<{ date: string; venue: Venue; salesIncGst: number }>
  events: Array<{ date: string; venue: Venue; exGst: number }>
  /** The manager's forecast for this week, per venue. */
  forecasts: Array<{ venue: Venue; amount: number }>
  /** Hourly till rows for today's weekday on the 4 weeks before. */
  hourlyHistory?: Array<{ date: string; venue: Venue; hour: number; revenueIncGst: number }>
  /** 1 + super + on-cost uplift. */
  labourMultiplier: number
}

const AEST_OFFSET_MS = 10 * 60 * 60 * 1000
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** AEST yyyy-mm-dd of an instant. */
export function aestDateKey(at: Date): string {
  return new Date(at.getTime() + AEST_OFFSET_MS).toISOString().split("T")[0]
}

/** Minutes past AEST midnight of an instant. */
function aestMinutes(at: Date): number {
  const d = new Date(at.getTime() + AEST_OFFSET_MS)
  return d.getUTCHours() * 60 + d.getUTCMinutes()
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * The usual share of a day's takings that is in by `minutes` past midnight:
 * for each earlier day, takings in the hours before now plus the elapsed
 * part of the current hour, over that day's total; then the median across
 * days. Null with fewer than two days of hourly rows, so one odd day (a
 * wet Sunday, a half-synced day) never sets the curve on its own.
 */
export function shareOfDayDone(rows: Array<{ date: string; hour: number; revenueIncGst: number }>, minutes: number): number | null {
  const byDate = new Map<string, number[]>()
  for (const r of rows) {
    if (!Number.isInteger(r.hour) || r.hour < 0 || r.hour > 23) continue
    const hours = byDate.get(r.date) ?? new Array<number>(24).fill(0)
    hours[r.hour] += Math.max(0, r.revenueIncGst)
    byDate.set(r.date, hours)
  }
  const m = Math.max(0, Math.min(24 * 60, minutes))
  const hour = Math.floor(m / 60)
  const part = (m - hour * 60) / 60
  const shares: number[] = []
  for (const hours of byDate.values()) {
    const total = hours.reduce((s, x) => s + x, 0)
    if (total <= 0) continue
    let done = 0
    for (let h = 0; h < 24; h++) {
      if (h < hour) done += hours[h]
      else if (h === hour) done += hours[h] * part
    }
    shares.push(done / total)
  }
  if (shares.length < 2) return null
  return Math.max(0, Math.min(1, median(shares)))
}

function isSalaryArea(area: string | null): boolean {
  return area?.toLowerCase().startsWith("salary") ?? false
}

export function buildLiveLabourSnapshot(rows: LiveLabourRows, now: Date): LiveSnapshot {
  const { start: weekStart } = currentTarteWeekRange(now)
  const todayAest = aestDateKey(now)
  const nowMs = now.getTime()
  const { labourMultiplier } = rows

  // All revenue per venue-day: tills (Bopple inside Square) + Uber Eats ex
  // GST + Xero event invoices. A day still to report its tills stays
  // missing so the forecast covers it (allRevenueByDay).
  const weekStartKey = weekStart.toISOString().split("T")[0]
  const allRows = allRevenueByDay(rows.pos, rows.uber, rows.events, todayAest).map((d) => ({
    venue: d.venue as Venue,
    date: d.date,
    totalRevenueExGst: d.totalExGst,
  }))
  const salesSummaries = allRows.filter((r) => r.date >= weekStartKey)
  const history = allRows.filter((r) => r.date < weekStartKey)

  // Daily revenue map: key = "<venue>|<yyyy-mm-dd>" → $
  const revByDay = new Map<string, number>()
  for (const s of salesSummaries) revByDay.set(`${s.venue}|${s.date}`, s.totalRevenueExGst)

  // Build the 7-day list (Wed → Tue) in AEST yyyy-mm-dd form.
  const days: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    days.push(d.toISOString().split("T")[0])
  }
  const lockedDays = days.filter((d) => d < todayAest)
  const remainingDays = days.filter((d) => d > todayAest)
  const dowOf = (dateStr: string) => new Date(`${dateStr}T00:00:00Z`).getUTCDay()

  const venues: LiveVenueSnapshot[] = SINGLE_VENUES.map((venue) => {
    // ---- Labour ----
    const venueShifts = rows.labourShifts.filter((s) => s.venue === venue)
    let labourToDate = 0
    let labourRemaining = 0
    let lockedHourly = 0
    let todayClocked = 0
    let todayRest = 0
    const salaryByDay = new Map<string, number>()
    const leaveByDay = new Map<string, number>()
    const bucketLeave: Record<Bucket, number> = { chefsKp: 0, fohBarista: 0, pastry: 0, other: 0 }
    const clockedByDay = new Map<string, number>()
    const aheadByDay = new Map<string, number>()
    const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v)
    const bucketSpent: Record<Bucket, number> = { chefsKp: 0, fohBarista: 0, pastry: 0, other: 0 }
    const bucketRoster: Record<Bucket, number> = { chefsKp: 0, fohBarista: 0, pastry: 0, other: 0 }
    const bucketToRun: Record<Bucket, number> = { chefsKp: 0, fohBarista: 0, pastry: 0, other: 0 }
    for (const s of venueShifts) {
      const bucket = bucketFor(venue, s.area)
      // Super on top of gross (12% on prod; the uplift for workers' comp
      // and payroll tax is 0 and stays 0, Chloe 15 Nov 2026), so the figure
      // lines up with the Xero pay runs (payweek-figures.ts).
      const cost = s.cost * labourMultiplier
      const dayKey = aestDateKey(s.shiftStart)
      if (s.source === "TIMESHEET") {
        labourToDate += cost
        bucketSpent[bucket] += cost
        add(clockedByDay, dayKey, cost)
        if (dayKey < todayAest) lockedHourly += cost
        else if (dayKey === todayAest) todayClocked += cost
        continue
      }
      // ROSTER rows.
      if (isSalaryArea(s.area)) {
        // Salary placeholder: a fixed cost with no timesheet behind it, so
        // the whole week's rows are in the projection.
        labourRemaining += cost
        bucketRoster[bucket] += cost
        salaryByDay.set(dayKey, (salaryByDay.get(dayKey) ?? 0) + cost)
        if (s.leave) {
          bucketLeave[bucket] += cost
          leaveByDay.set(dayKey, (leaveByDay.get(dayKey) ?? 0) + cost)
        }
        continue
      }
      const startMs = s.shiftStart.getTime()
      const endMs = s.shiftEnd.getTime()
      if (startMs > nowMs) {
        // Not started: all of it is still to come.
        labourRemaining += cost
        bucketRoster[bucket] += cost
        bucketToRun[bucket] += cost
        add(aheadByDay, dayKey, cost)
        if (dayKey === todayAest) todayRest += cost
      } else if (endMs > nowMs && endMs > startMs) {
        // Underway: the timesheet carries the hours so far, the roster the
        // part still to run.
        const rest = cost * ((endMs - nowMs) / (endMs - startMs))
        labourRemaining += rest
        bucketRoster[bucket] += rest
        bucketToRun[bucket] += rest
        add(aheadByDay, todayAest, rest)
        todayRest += rest
      }
    }
    const labourProjected = labourToDate + labourRemaining

    // Salary for the completed days: each row counts on its own day. The
    // Shifts feed places salaries by the day worked (16 Oct 2026). The old
    // weekly form (one row on the Wednesday for the whole week) looks the
    // same as a single salaried Wednesday, so it is not second-guessed: if
    // it ever came back, locked would read high early in the week, not low.
    let lockedSalary = 0
    for (const [day, cost] of salaryByDay) if (day < todayAest) lockedSalary += cost
    const lockedLabour = lockedHourly + lockedSalary
    let paidLeave = 0
    let lockedLeave = 0
    for (const [day, cost] of leaveByDay) {
      paidLeave += cost
      if (day < todayAest) lockedLeave += cost
    }

    // ---- Revenue ----
    const lockedRevenue = lockedDays.reduce((sum, d) => sum + (revByDay.get(`${venue}|${d}`) ?? 0), 0)
    const todayRevenue = revByDay.get(`${venue}|${todayAest}`) ?? 0
    const revenueToDate = lockedRevenue + todayRevenue
    const todayLive = rows.pos.some((p) => p.venue === venue && p.date === todayAest && p.source === "API")

    // Forecast for a day still to come, in priority order:
    //   1. Day-of-week median from the prior 4 Tarte weeks, scaled by how
    //      this week's completed days ran against their own medians.
    //   2. The manager's weekly forecast, a seventh per day.
    //   3. Average of the completed days.
    const historyByDow = new Map<number, number[]>()
    for (const h of history) {
      if (h.venue !== venue) continue
      const dow = dowOf(h.date)
      const arr = historyByDow.get(dow) ?? []
      arr.push(h.totalRevenueExGst)
      historyByDow.set(dow, arr)
    }
    let lockedHistoricalSum = 0
    let lockedHistoricalDays = 0
    for (const dStr of lockedDays) {
      const samples = historyByDow.get(dowOf(dStr)) ?? []
      if (samples.length >= 2) {
        lockedHistoricalSum += median(samples)
        lockedHistoricalDays += 1
      }
    }
    const thisWeekScale = lockedHistoricalDays >= 3 && lockedHistoricalSum > 0 ? lockedRevenue / lockedHistoricalSum : 1
    /** A whole day's usual takings at this week's trade, or null with thin history. */
    const usualDay = (dateStr: string): number | null => {
      const samples = historyByDow.get(dowOf(dateStr)) ?? []
      return samples.length >= 2 ? median(samples) * thisWeekScale : null
    }
    const fallbackDay = (): number => {
      const forecastRow = rows.forecasts.find((f) => f.venue === venue)
      const weeklyForecast = forecastRow ? forecastRow.amount : null
      if (weeklyForecast && weeklyForecast > 0) return weeklyForecast / 7
      return lockedDays.length > 0 ? lockedRevenue / lockedDays.length : 0
    }

    let remainingForecast = 0
    const forecastByDay = new Map<string, number>()
    for (const dateStr of remainingDays) {
      const f = usualDay(dateStr) ?? fallbackDay()
      forecastByDay.set(dateStr, f)
      remainingForecast += f
    }

    // Today. No till figure yet: forecast the whole day. An intraday
    // figure: add the usual rest of the day. A final figure: nothing.
    let share: number | null = null
    let revenueRestOfDay = 0
    if (todayRevenue === 0) {
      revenueRestOfDay = usualDay(todayAest) ?? fallbackDay()
    } else if (todayLive) {
      share = shareOfDayDone(
        (rows.hourlyHistory ?? []).filter((h) => h.venue === venue && h.date < todayAest),
        aestMinutes(now)
      )
      const usual = usualDay(todayAest)
      if (share != null && usual != null) revenueRestOfDay = usual * (1 - share)
    }
    remainingForecast += revenueRestOfDay
    const revenueProjected = revenueToDate + remainingForecast

    // Week to date vs the same span last week, from the same rows the
    // forecast uses (history covers the prior 4 weeks).
    const compare = compareSales(
      [...salesSummaries, ...history]
        .filter((r) => r.venue === venue)
        .map((r) => ({ date: r.date, revenueExGst: r.totalRevenueExGst })),
      todayAest
    )

    const overallProjectedPct = revenueProjected > 0 ? (labourProjected / revenueProjected) * 100 : null

    const buckets: LiveBucketRow[] = bucketTargets(venue).map((t) => {
      const spent = bucketSpent[t.key]
      const total = spent + bucketRoster[t.key]
      const pct = revenueProjected > 0 ? (total / revenueProjected) * 100 : null
      const workingPct = revenueProjected > 0 ? ((total - bucketLeave[t.key]) / revenueProjected) * 100 : null
      return {
        key: t.key,
        label: t.label,
        target: t,
        spentToDate: round2(spent),
        projectedTotal: round2(total),
        projectedPct: pct,
        status: bucketStatus(pct, t),
        varianceVsBandPct: pct == null ? null : pct - t.max,
        paidLeave: round2(bucketLeave[t.key]),
        workingPct,
        workingStatus: bucketStatus(workingPct, t),
        workingVarianceVsBandPct: workingPct == null ? null : workingPct - t.max,
        rosterStillToRun: round2(bucketToRun[t.key]),
      }
    })

    const dayRows: LiveDayRow[] = days.map((date) => {
      const clocked = clockedByDay.get(date) ?? 0
      const sal = salaryByDay.get(date) ?? 0
      const ahead = aheadByDay.get(date) ?? 0
      const state: LiveDayRow["state"] = date < todayAest ? "locked" : date === todayAest ? "today" : "ahead"
      // A finished day is what was clocked; today and the days ahead add
      // what is still to run. Anything clocked on a day ahead (a timesheet
      // dated wrong) still counts rather than vanishing.
      const labour = state === "locked" ? clocked + sal : clocked + sal + ahead
      const revenue = state === "ahead" ? (forecastByDay.get(date) ?? 0) : (revByDay.get(`${venue}|${date}`) ?? 0)
      const leave = leaveByDay.get(date) ?? 0
      return {
        date,
        dayName: DAY_NAMES[dowOf(date)],
        state,
        labour: round2(labour),
        ...(state === "today" ? { labourSoFar: round2(clocked + sal) } : {}),
        revenue: round2(revenue),
        pct: revenue > 0 ? (labour / revenue) * 100 : null,
        paidLeave: round2(leave),
        workingPct: revenue > 0 ? ((labour - leave) / revenue) * 100 : null,
      }
    })

    return {
      venue,
      label: VENUE_LABEL[venue],
      labourToDate: round2(labourToDate),
      labourProjected: round2(labourProjected),
      revenueToDate: round2(revenueToDate),
      revenueProjected: round2(revenueProjected),
      revenueLastWeekSameDays: compare.lastWeekSameDays,
      revenueVsLastWeekPct: compare.weekToDateVsLastWeekPct,
      revenueLastWeekTotal: compare.lastWeekTotal,
      overallProjectedPct,
      paidLeave: round2(paidLeave),
      workingProjectedPct: revenueProjected > 0 ? ((labourProjected - paidLeave) / revenueProjected) * 100 : null,
      locked: {
        labour: round2(lockedLabour),
        revenue: round2(lockedRevenue),
        pct: lockedDays.length > 0 && lockedRevenue > 0 ? (lockedLabour / lockedRevenue) * 100 : null,
        days: lockedDays.length,
        paidLeave: round2(lockedLeave),
        workingPct: lockedDays.length > 0 && lockedRevenue > 0 ? ((lockedLabour - lockedLeave) / lockedRevenue) * 100 : null,
      },
      today: {
        live: todayLive,
        labourSoFar: round2(todayClocked),
        revenueSoFar: round2(todayRevenue),
        shareOfDayDone: share,
        revenueRestOfDay: round2(revenueRestOfDay),
        labourRestOfDay: round2(todayRest),
      },
      rosterStillToRun: round2(bucketToRun.chefsKp + bucketToRun.fohBarista + bucketToRun.pastry + bucketToRun.other),
      revenueStillToCome: round2(remainingForecast),
      days: dayRows,
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
