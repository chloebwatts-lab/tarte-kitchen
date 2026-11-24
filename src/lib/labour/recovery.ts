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
  const roster = Math.round(plan.stillToRun)
  const nothingLeft = roster === 0
  const takingsLeft = Math.round(opts.revenueStillToCome) > 0
  // A team counts as over only by a whole dollar or more (never "$0 over").
  const teams = plan.depts.filter((d) => Math.round(d.over) >= 1)

  if (weekOn && teams.length === 0) {
    const spare = Math.round(-plan.gap)
    return {
      target,
      tone: "ok",
      headline:
        spare === 0
          ? `On target to the dollar and every team inside its band.${nothingLeft ? "" : ` Keep ${rest} to the roster as it stands.`}`
          : nothingLeft
            ? `On track: the week finishes ${money(spare)} under ${target} with every team inside its band.`
            : `On track, ${money(spare)} to spare and every team inside its band. ${rest} can carry up to ${money(spare)} more wages and still finish on ${target}.`,
      teams: [],
      notes: [],
      week: null,
    }
  }

  // Each team is held to its own band (Chloe 12 Nov 2026), so a team's
  // overspend can only come off that team's own shifts still to run:
  //   full    over <= what it has left: cut the overspend, back inside its band
  //   partial over > what it has left: cut all it has left, still over
  //   stuck   nothing left rostered: no cut this week helps it
  // Cutting another team's shifts never brings a team inside its band; only
  // the week gap still standing after the team cuts ("Plus") may come off any team.
  const dollarsOf = (d: DeptRecovery) => Math.max(1, Math.round(d.over))
  const leftOf = (d: DeptRecovery) => (nothingLeft ? 0 : Math.round(d.stillToRun))
  const full = teams.filter((d) => leftOf(d) > 0 && dollarsOf(d) <= leftOf(d))
  const partial = teams.filter((d) => leftOf(d) > 0 && dollarsOf(d) > leftOf(d))
  const stuck = teams.filter((d) => leftOf(d) === 0)
  // Whole dollars that add up: the headline is the sum of the lines under it.
  const teamCut = full.reduce((sum, d) => sum + dollarsOf(d), 0) + partial.reduce((sum, d) => sum + leftOf(d), 0)
  const plusDollars = !nothingLeft && !weekOn ? Math.max(0, Math.round(plan.gap) - teamCut) : 0
  const cutDollars = teamCut + plusDollars
  const names = (list: DeptRecovery[]) => (list.length === 1 ? list[0].label : `${list.slice(0, -1).map((d) => d.label).join(", ")} and ${list[list.length - 1].label}`)
  const and = (parts: string[]) => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`)

  let headline: string
  if (nothingLeft) {
    headline = teams.length
      ? `Nothing left on the roster to cut, so ${teams.length === 1 ? `${teams[0].label} stays over its band` : `${names(teams)} stay over their bands`} this week.`
      : `Nothing left on the roster to cut, so the week ${takingsLeft ? "is set to finish" : "finishes"} ${money(Math.round(plan.gap))} over ${target}.`
  } else if (cutDollars === 0) {
    headline = `No cut fixes it this week: ${names(stuck)} ${stuck.length === 1 ? "has" : "have"} nothing left rostered. Take it up with the team for next week.`
  } else {
    const goals: string[] = []
    if (full.length) goals.push(full.length === teams.length ? "every team inside its band" : `${names(full)} inside ${full.length === 1 ? "its band" : "their bands"}`)
    if (partial.length) goals.push(`${names(partial)} as close to ${partial.length === 1 ? "its band as its" : "their bands as their"} shifts allow`)
    if (!weekOn) goals.push(`the week on ${target}`)
    headline = `Cut ${money(cutDollars)} of wages, ${rest}, to get ${and(goals)}.`
  }

  // A team's % to as many places as it takes to read above its top (13.501%, not 13.5%).
  const teamPct = (d: DeptRecovery) => {
    for (let places = 1; places <= 4; places++) if (Number(d.pct.toFixed(places)) > d.max) return `${d.pct.toFixed(places)}%`
    return `${d.pct.toFixed(4)}%`
  }
  const teamLines = teams.map((d) => {
    const head = `${d.label}: ${money(dollarsOf(d))} over its ${d.max}% top (${teamPct(d)}).`
    if (nothingLeft) return `${head} Take it up with the team for next week.`
    if (stuck.includes(d)) return `${head} Nothing left rostered in this team: take it up with the team for next week.`
    if (partial.includes(d))
      return `${head} It still has ${money(leftOf(d))} rostered, not enough to fix it with cuts alone: cut all of it and it still finishes ${money(dollarsOf(d) - leftOf(d))} over.`
    return `${head} It still has ${money(leftOf(d))} rostered.`
  })

  const notes: string[] = []
  if (!nothingLeft) {
    if (plusDollars >= 1 && teamCut > 0) notes.push(`Plus ${money(plusDollars)} from any team with shifts left to land the week on ${target}.`)
    if (cutDollars > roster) notes.push(`The ${money(cutDollars)} cut is more than the ${money(roster)} left on the whole roster, so cuts alone will not get there.`)
    else if (cutDollars > 0 && teamCut === 0) notes.push(`From the ${money(roster)} still rostered.`)
  }

  const clauses: string[] = []
  if (plan.soFar) {
    const d = Math.round(plan.soFar.overTarget)
    clauses.push(d === 0 ? `${doneRange(plan.soFar.days)} landed on target` : `${doneRange(plan.soFar.days)} ${d > 0 ? "ran" : "banked"} ${money(Math.abs(d))} ${d > 0 ? "over" : "under"}`)
  }
  if (!(nothingLeft && !takingsLeft)) clauses.push(`${rest} as rostered runs at ${pct1(plan.rest.pct)}`)
  const weekState = weekOn ? (Math.round(plan.gap) === 0 ? `on ${target} to the dollar` : `${money(-plan.gap)} under ${target}`) : `${money(plan.gap)} over ${target}`
  const above =
    plan.extraTakingsPct != null && plan.extraTakingsPct >= 0.1
      ? ` (${plan.extraTakingsPct.toFixed(plan.extraTakingsPct < 10 ? 1 : 0)}% above the ${money(opts.revenueStillToCome)} still expected)`
      : ""
  const takeMore = !weekOn && takingsLeft && plan.extraTakings != null ? ` Or take ${money(plan.extraTakings)} more than forecast${above} to bring the week back to ${target}.` : ""
  const week = `Week overall: ${weekState}.${clauses.length ? ` ${clauses.join("; ")}.` : ""}${takeMore}`

  return {
    target,
    tone: "red",
    headline,
    teams: teamLines,
    notes,
    week,
  }
}
