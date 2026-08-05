/**
 * Monday-anchored week helpers for the commitments module, the same
 * AEST + Monday cycle convention as weekly checklist runs (see
 * `cycleAnchor` in src/lib/actions/checklists.ts).
 */

/** The Monday of the week the Said + Done sheet started (Jose/Candy
 *  kitchen reset meeting, July 2026). Weeks before this aren't shown. */
export const COMMITMENTS_EPOCH = "2026-07-06"

export function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

/** Today's AEST calendar date as a UTC-midnight Date (Brisbane, no DST). */
export function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  return new Date(aest.toISOString().split("T")[0])
}

/** Monday of the week containing `d` (interpreted as a UTC-midnight date). */
export function mondayOf(d: Date): Date {
  const out = new Date(d)
  const daysSinceMonday = (out.getUTCDay() + 6) % 7 // getUTCDay: 0=Sun..6=Sat
  out.setUTCDate(out.getUTCDate() - daysSinceMonday)
  return out
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

/** Monday of the current AEST week, as YYYY-MM-DD. */
export function currentWeekStart(): string {
  return ymd(mondayOf(todayAest()))
}

/**
 * Week-start dates to show on the board: from the epoch up to the
 * current week, newest first, capped at `max`.
 */
export function boardWeekStarts(max = 12): string[] {
  const weeks: string[] = []
  let cursor = mondayOf(todayAest())
  const epoch = new Date(COMMITMENTS_EPOCH)
  while (cursor >= epoch && weeks.length < max) {
    weeks.push(ymd(cursor))
    cursor = addDays(cursor, -7)
  }
  return weeks
}

/**
 * The most recent fully completed Mon–Sun week (its Sunday is before
 * today). Used by the digest so streaks never count the in-flight week.
 */
export function lastCompletedWeekStart(): string {
  const thisMonday = mondayOf(todayAest())
  return ymd(addDays(thisMonday, -7))
}
