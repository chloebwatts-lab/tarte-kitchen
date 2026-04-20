/**
 * Date helpers. Tarte's operating week runs **Wednesday → Tuesday** — not
 * ISO Monday weeks. Every labour/sales/cost aggregation that rolls up per
 * week should use these helpers, not `startOfWeek` from date-fns.
 */

/**
 * Given any date, return the UTC midnight of the **Wednesday** that
 * begins the Tarte week containing it.
 *
 * Wednesday is ISO weekday 3, Thursday 4, … Tuesday 2.
 * Formula: weekday index with Wed=0: (isoWeekday + 4) % 7
 *   Wed = (3+4)%7 = 0
 *   Thu = (4+4)%7 = 1
 *   …
 *   Tue = (2+4)%7 = 6
 *
 * We work in UTC throughout — the DB stores DATE columns which ignore
 * timezone, and the 10h AEST offset is handled elsewhere.
 */
export function startOfTarteWeekUtc(d: Date): Date {
  const out = new Date(d)
  out.setUTCHours(0, 0, 0, 0)
  const iso = out.getUTCDay() === 0 ? 7 : out.getUTCDay()
  const offsetFromWed = (iso + 4) % 7
  out.setUTCDate(out.getUTCDate() - offsetFromWed)
  return out
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
 * Returns Unix seconds for Deputy's search API.
 */
export function liveRosterWindowUnix(now = new Date()): {
  sinceUnix: number
  untilUnix: number
} {
  const start = startOfTarteWeekUtc(now)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + 14) // 2 weeks
  return {
    sinceUnix: Math.floor(start.getTime() / 1000),
    untilUnix: Math.floor(end.getTime() / 1000),
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
