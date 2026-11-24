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
 *
 * Teams first (Chloe, 23 Nov 2026: "I think you're wrong about the only
 * $55"). The week as a whole nets one team's overspend against another's
 * underspend and against a strong weekend already banked: Beach House read
 * $55 over 39% while Chefs + KP alone was $963 over its band. Departments
 * are held strictly to their own band (Chloe, 12 Nov 2026), so the cut
 * asked for is every team's overspend added up, never netted, or the week
 * gap if that is bigger: `cutToFix`.
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
  /** Every department's overspend added up, never netted against a team under its band. */
  teamsOver: number
  /** The cut that puts every team inside its band and the week on target: max(teamsOver, gap). Null when nothing is over. */
  cutToFix: number | null
  /** True when cutToFix is more than everything still rostered. */
  cutOutOfReach: boolean
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
  const teamsOver = r2(depts.reduce((sum, d) => sum + d.over, 0))
  const cut = Math.max(teamsOver, gap)

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
    teamsOver,
    cutToFix: cut > 0 ? r2(cut) : null,
    cutOutOfReach: cut > 0 && cut > stillToRun,
  }
}

// ---- Wording for the "To finish the week on target" box ----

const money = (n: number) => `$${Math.round(n).toLocaleString("en-AU")}`
const pct1 = (n: number | null) => (n == null ? "n/a" : `${n.toFixed(1)}%`)
const DAY = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"]

/** "Wed to Sun" for the finished days. */
export function doneRange(days: number): string {
  if (days <= 0) return ""
  return days === 1 ? "Wed" : `Wed to ${DAY[Math.min(days, 7) - 1]}`
}

/** "Mon to Tue" for today to the end of the week; "Tue" on a Tuesday. */
export function restRange(lockedDays: number): string {
  const from = Math.min(Math.max(lockedDays, 0), 6)
  return from === 6 ? "Tue" : `${DAY[from]} to Tue`
}

export interface RecoveryCopy {
  target: string
  tone: "ok" | "red"
  headline: string
  /** One line per team over its top by at least a dollar. */
  teams: string[]
  /** Lines under the teams: the rest of the week gap, out of reach. */
  notes: string[]
  /** Week overall: banked, pace of the days left, the takings alternative. Null when clean. */
  week: string | null
}

/**
 * The box's wording, pure so every case is tested. Under a dollar either
 * way counts as on target, for the week and for each team (never "Cut $0").
 */
export function recoveryCopy(plan: RecoveryPlan, opts: { lockedDays: number; revenueStillToCome: number }): RecoveryCopy {
  const target = `${plan.targetPct % 1 === 0 ? plan.targetPct.toFixed(0) : plan.targetPct.toFixed(2)}%`
  const rest = restRange(opts.lockedDays)
  const weekOn = plan.onTrack || Math.round(plan.gap) === 0
  const teams = plan.depts.filter((d) => Math.round(d.over) >= 1)
  const teamsOver = teams.reduce((s, d) => s + d.over, 0)
  const cut = Math.max(teamsOver, weekOn ? 0 : plan.gap)

  if (weekOn && teams.length === 0) {
    return {
      target,
      tone: "ok",
      headline:
        Math.round(plan.gap) === 0
          ? `On target to the dollar and every team inside its band. Keep ${rest} to the roster as it stands.`
          : `On track, ${money(-plan.gap)} to spare and every team inside its band. ${rest} can carry up to ${money(-plan.gap)} more wages and still finish on ${target}.`,
      teams: [],
      notes: [],
      week: null,
    }
  }

  // Whole dollars that add up: the headline is the sum of the lines under it.
  const teamDollars = teams.map((d) => Math.max(1, Math.round(d.over)))
  const plusDollars = teams.length && !weekOn ? Math.max(0, Math.round(plan.gap - teamsOver)) : 0
  const cutDollars = teams.length ? teamDollars.reduce((s, n) => s + n, 0) + plusDollars : Math.round(cut)
  const nothingLeft = Math.round(plan.stillToRun) === 0
  const why =
    teams.length && !weekOn
      ? `to get every team inside its band and the week on ${target}`
      : teams.length
        ? "to get every team inside its band"
        : `to get the week on ${target}`
  const headline = nothingLeft
    ? `Nothing left on the roster to cut, so the week finishes ${teams.length ? `with ${teams.length === 1 ? "a team" : `${teams.length} teams`} over ${teams.length === 1 ? "its band" : "their bands"}` : `${money(cutDollars)} over ${target}`}.`
    : `Cut ${money(cutDollars)} of wages, ${rest}, ${why}.`
  // A team's % to two places when one place would read the same as its top.
  const teamPct = (d: DeptRecovery) => (Number(d.pct.toFixed(1)) <= d.max ? `${d.pct.toFixed(2)}%` : pct1(d.pct))
  const teamLines = teams.map((d, i) => {
    const head = `${d.label}: ${money(teamDollars[i])} over its ${d.max}% top (${teamPct(d)}).`
    if (nothingLeft) return `${head} Take it up with the team for next week.`
    if (Math.round(d.stillToRun) === 0) return `${head} Nothing left rostered in this team, so take it from the others.`
    return `${head} It still has ${money(d.stillToRun)} rostered${d.outOfReach ? ", not enough to fix it with cuts alone" : ""}.`
  })
  const notes: string[] = []
  if (plusDollars >= 1) notes.push(`Plus ${money(plusDollars)} from any team to land the week on ${target}.`)
  if (!nothingLeft) {
    if (cutDollars > plan.stillToRun) notes.push(`The ${money(cutDollars)} cut is more than the ${money(plan.stillToRun)} left on the whole roster, so cuts alone will not get there.`)
    else if (!teams.length) notes.push(`From the ${money(plan.stillToRun)} still rostered.`)
  }

  const banked = plan.soFar
    ? ` ${doneRange(plan.soFar.days)} ${plan.soFar.overTarget > 0 ? "ran" : "banked"} ${money(Math.abs(plan.soFar.overTarget))} ${plan.soFar.overTarget > 0 ? "over" : "under"};`
    : ""
  const weekState = weekOn ? (Math.round(plan.gap) === 0 ? `on ${target} to the dollar` : `${money(-plan.gap)} under ${target}`) : `${money(plan.gap)} over ${target}`
  const takeMore =
    !weekOn && opts.revenueStillToCome > 0 && plan.extraTakings != null
      ? ` Or take ${money(plan.extraTakings)} more than forecast${plan.extraTakingsPct != null ? ` (${plan.extraTakingsPct.toFixed(plan.extraTakingsPct < 10 ? 1 : 0)}% above the ${money(opts.revenueStillToCome)} still expected)` : ""} to bring the week back to ${target}.`
      : ""

  return {
    target,
    tone: "red",
    headline,
    teams: teamLines,
    notes,
    week: `Week overall: ${weekState}.${banked} ${rest} as rostered runs at ${pct1(plan.rest.pct)}.${takeMore}`,
  }
}
