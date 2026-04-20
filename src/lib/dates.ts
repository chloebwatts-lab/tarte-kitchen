/**
 * Date helpers. Tarte's operating week runs **Wednesday → Tuesday** in
 * Queensland local time (Australia/Brisbane, UTC+10, no DST). Every
 * labour/sales/cost aggregation that rolls up per week should use these
 * helpers, not `startOfWeek` from date-fns.
 */

const BRISBANE_OFFSET_MS = 10 * 60 * 60 * 1000

/**
 * Given any date, return a Date at Wed 00:00 UTC representing the AEST
 * Wednesday of the week containing it — matching the `weekStartWed` DATE
 * column convention in the DB (yyyy-mm-dd of the AEST Wednesday).
 *
 * The +10h shift projects the input into AEST's clock space, then we
 * snap to midnight and walk back to Wednesday. Result is a pure-UTC-
 * midnight Date whose yyyy-mm-dd is the AEST Wednesday — so DB lookups
 * for existing rows keyed to a Wed UTC midnight continue to work, and
 * shift bucketing now respects AEST week boundaries (critical for early-
 * Wednesday bakery shifts whose UTC timestamp falls on Tuesday).
 */
export function startOfTarteWeekUtc(d: Date): Date {
  const shifted = new Date(d.getTime() + BRISBANE_OFFSET_MS)
  shifted.setUTCHours(0, 0, 0, 0)
  const iso = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay()
  const offsetFromWed = (iso + 4) % 7
  shifted.setUTCDate(shifted.getUTCDate() - offsetFromWed)
  return shifted
}

/** ISO yyyy-mm-dd of the Wednesday that starts the Tarte week. */
export function weekStartWedIso(d: Date): string {
  return startOfTarteWeekUtc(d).toISOString().split("T")[0]
}

/** This-Wed-midnight and next-Wed-midnight (the start of the following week). */
export function currentTarteWeekRange(now = new Date()): { start: Date; end: Date } {
  const start = startOfTarteWeekUtc(now)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 7)
  return { start, end }
}

/**
 * The 2-week window we sync from Deputy's Roster (live + next).
 * Returns Unix seconds for Deputy's search API. The window bounds are
 * the **actual UTC instants** of Wed 00:00 AEST → 2 weeks later, so
 * Deputy returns every shift inside Tarte's AEST week (including the
 * 4am Wed bakery shifts whose UTC StartTime falls on Tue 18:00 UTC).
 */
export function liveRosterWindowUnix(now = new Date()): {
  sinceUnix: number
  untilUnix: number
} {
  // startOfTarteWeekUtc returns Wed 00:00 UTC labelled as the AEST Wed;
  // subtract 10h to get the actual UTC instant of Wed 00:00 AEST.
  const wedAestInstant = new Date(
    startOfTarteWeekUtc(now).getTime() - BRISBANE_OFFSET_MS
  )
  const endInstant = new Date(
    wedAestInstant.getTime() + 14 * 24 * 60 * 60 * 1000
  )
  return {
    sinceUnix: Math.floor(wedAestInstant.getTime() / 1000),
    untilUnix: Math.floor(endInstant.getTime() / 1000),
  }
}

/** Human label: "Wed 22 Apr – Tue 28 Apr" */
export function tarteWeekLabel(weekStartWed: Date): string {
  const end = new Date(weekStartWed)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  return `${fmt(weekStartWed)} – ${fmt(end)}`
}
