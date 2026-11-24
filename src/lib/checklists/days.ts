/**
 * Which checklist lines are on today's list (Currumbin cafe sheets, Chloe
 * 24 Nov 2026). Some lines only apply on some days: "Order alcohol" is Wed,
 * Fri and Mon, "Extra tables out on the beach" is Sat and Sun, the surcharge
 * lines are Sunday plus any public holiday. A daily run is built with only
 * the lines that apply on its date, so every count downstream (tiles,
 * progress, completion, council folder) stays right without knowing about
 * days at all. Plain module, no db, so it can be unit tested.
 */

export interface DayRule {
  /** 0 = Sunday to 6 = Saturday. Empty = every day. */
  days: number[]
  alsoOnPublicHolidays: boolean
}

/**
 * QLD public holidays that apply on the Gold Coast. Mirrors Tarte Shifts'
 * holiday list (Settings, which pay rates use) and runs on through 2027.
 * Add the Gold Coast Show Day for 2027 once the date is gazetted.
 */
export const QLD_PUBLIC_HOLIDAYS: ReadonlySet<string> = new Set([
  "2026-08-28", // Gold Coast Show Day
  "2026-10-05", // King's Birthday
  "2026-12-25", // Christmas Day
  "2026-12-26", // Boxing Day
  "2026-12-28", // Boxing Day (observed)
  "2027-01-01", // New Year's Day
  "2027-01-26", // Australia Day
  "2027-03-26", // Good Friday
  "2027-03-27", // Easter Saturday
  "2027-03-28", // Easter Sunday
  "2027-03-29", // Easter Monday
  "2027-04-25", // Anzac Day
  "2027-05-03", // Labour Day
  "2027-10-04", // King's Birthday
  "2027-12-25", // Christmas Day
  "2027-12-26", // Boxing Day
  "2027-12-27", // Christmas Day (observed)
  "2027-12-28", // Boxing Day (observed)
])

export function isQldPublicHoliday(ymd: string): boolean {
  return QLD_PUBLIC_HOLIDAYS.has(ymd)
}

/** Weekday of a YYYY-MM-DD date, 0 = Sunday. The date is already AEST. */
export function weekdayOf(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

/** True when the line belongs on the list for this AEST date. */
export function lineOnDate(rule: DayRule, ymd: string): boolean {
  if (rule.days.length === 0) return true
  if (rule.days.includes(weekdayOf(ymd))) return true
  return rule.alsoOnPublicHolidays && isQldPublicHoliday(ymd)
}

/** Only one-day lists filter by day. A weekly or monthly run spans many days. */
export function cadenceUsesDays(cadence: string): boolean {
  return cadence === "DAILY" || cadence === "ON_DEMAND"
}
