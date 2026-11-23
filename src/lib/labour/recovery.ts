/**
 * What it takes to finish the week on target (Chloe, 23 Nov 2026: "what
 * they need to do Sunday to Tues to recover the % and hit target ... after
 * Wed to Sat how we're tracking and if we're over what we need to either do
 * in revenue or if we go for target what we need to save in wages").
 *
 * Pure, on top of the live snapshot (src/lib/labour/live.ts), so the page
 * and the tests share it. Paid leave is out of every figure, the same as
 * the big number on Wages + COGS.
 *
 * The venue target is the department band tops added up: Beach House
 * 13.5 + 22.5 + 3.0 = 39%, the same 39% Tarte Shifts shows on the roster.
 * Tea Garden has no bands, so no target and no plan.
 *
 * Two ways to close a gap, either one on its own lands the week on target:
 *   wages:   cut `gap` from the hourly roster still to run (today to Tue)
 *   takings: take gap / target more than the forecast for the same days
 */
import type { Venue } from "@/generated/prisma/client"
import { bucketTargets } from "@/lib/labour/buckets"
import type { LiveVenueSnapshot } from "@/lib/labour/live"

const r2 = (n: number) => Math.round(n * 100) / 100

/** The venue's wage % target: its department band tops added up. Null without bands. */
export function venueWageTarget(venue: Venue): number | null {
  const bands = bucketTargets(venue)
  if (!bands.length) return null
  return Math.round(bands.reduce((s, b) => s + b.max, 0) * 100) / 100
}

export interface DeptRecovery {
  label: string
  /** Band top, percent. */
  max: number
  /** Projected department % for the week, paid leave out. */
  pct: number
  /** Dollars over the band top at the projected takings. */
  over: number
  /** This department's hourly roster still to run. */
  stillToRun: number
  /** True when cutting everything still rostered would not close it. */
  outOfReach: boolean
}

export interface RecoveryPlan {
  targetPct: number
  /** Finished days, actual. Null on a Wednesday (nothing finished yet). */
  soFar: { days: number; pct: number | null; wages: number; revenue: number; overTarget: number } | null
  /** Today to Tuesday as planned: wages still to come (clocked today, salaries, roster) on forecast takings. */
  rest: { days: number; wages: number; revenue: number; pct: number | null; maxWagesForTarget: number }
  /** Projected week, paid leave out. */
  week: { wages: number; revenue: number; pct: number | null }
  /** Wages over target at the projected takings; negative = room to spare. */
  gap: number
  onTrack: boolean
  /** Cut this from the roster still to run (null when on track). */
  wagesToCut: number | null
  /** The hourly roster still to run, the most that can be cut. */
  stillToRun: number
  /** True when cutting all of it would not get there. */
  wagesOutOfReach: boolean
  /** Extra takings on top of the forecast for the rest of the week (null when on track). */
  extraTakings: number | null
  /** That extra as a share of the rest-of-week forecast, percent (null when the forecast is 0). */
  extraTakingsPct: number | null
  /** Departments over their band top, worst dollars first. */
  depts: DeptRecovery[]
}

export function recoveryPlan(v: LiveVenueSnapshot, targetPct: number | null = venueWageTarget(v.venue)): RecoveryPlan | null {
  if (targetPct == null || targetPct <= 0) return null
  const t = targetPct / 100
  const weekWages = v.labourProjected - v.paidLeave
  const weekRevenue = v.revenueProjected
  if (!(weekRevenue > 0)) return null

  const lockedWages = v.locked.labour - v.locked.paidLeave
  const soFar =
    v.locked.days > 0
      ? {
          days: v.locked.days,
          pct: v.locked.revenue > 0 ? (lockedWages / v.locked.revenue) * 100 : null,
          wages: r2(lockedWages),
          revenue: r2(v.locked.revenue),
          overTarget: r2(lockedWages - t * v.locked.revenue),
        }
      : null

  const restWages = weekWages - lockedWages
  const restRevenue = weekRevenue - v.locked.revenue
  const gap = r2(weekWages - t * weekRevenue)
  const onTrack = gap <= 0
  const stillToRun = Math.max(0, v.rosterStillToRun)

  const depts: DeptRecovery[] = []
  for (const b of v.buckets) {
    if (!b.target || b.workingPct == null) continue
    const over = r2((b.projectedTotal - b.paidLeave) - (b.target.max / 100) * weekRevenue)
    if (over <= 0) continue
    depts.push({
      label: b.label,
      max: b.target.max,
      pct: b.workingPct,
      over,
      stillToRun: Math.max(0, b.rosterStillToRun),
      outOfReach: over > Math.max(0, b.rosterStillToRun),
    })
  }
  depts.sort((a, b) => b.over - a.over)

  return {
    targetPct,
    soFar,
    rest: {
      days: 7 - v.locked.days,
      wages: r2(restWages),
      revenue: r2(restRevenue),
      pct: restRevenue > 0 ? (restWages / restRevenue) * 100 : null,
      maxWagesForTarget: r2(t * weekRevenue - lockedWages),
    },
    week: { wages: r2(weekWages), revenue: r2(weekRevenue), pct: (weekWages / weekRevenue) * 100 },
    gap,
    onTrack,
    wagesToCut: onTrack ? null : gap,
    stillToRun: r2(stillToRun),
    wagesOutOfReach: !onTrack && gap > stillToRun,
    extraTakings: onTrack ? null : r2(gap / t),
    extraTakingsPct: onTrack || !(v.revenueStillToCome > 0) ? null : (gap / t / v.revenueStillToCome) * 100,
    depts,
  }
}
