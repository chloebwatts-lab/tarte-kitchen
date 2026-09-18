/**
 * "Needed by" on a prep request: the day and the time of day the station
 * wants the item ready. Stored as a UTC instant on RestockLine.neededBy,
 * chosen and displayed in Brisbane time (UTC+10, no DST).
 */
const OFFSET_MS = 10 * 60 * 60 * 1000

export const NEEDED_BY_TIMES: { label: string; hour: number }[] = [
  { label: "Open", hour: 6 },
  { label: "8am", hour: 8 },
  { label: "10am", hour: 10 },
  { label: "12pm", hour: 12 },
  { label: "2pm", hour: 14 },
]

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

/** Brisbane calendar date (yyyy-mm-dd) of an instant. */
export function brisbaneYmd(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10)
}

/** Build the UTC instant for `ymd` at `hour` Brisbane time. */
export function neededByAt(ymd: string, hour: number): Date {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + hour * 3600_000 - OFFSET_MS)
}

/** Day choices offered on the count sheet: tomorrow plus the next two days. */
export function neededByDays(now = new Date()): { ymd: string; label: string }[] {
  const out: { ymd: string; label: string }[] = []
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getTime() + OFFSET_MS + i * 86400_000)
    out.push({
      ymd: d.toISOString().slice(0, 10),
      label: i === 1 ? "Tomorrow" : DAY[d.getUTCDay()],
    })
  }
  return out
}

/** Pull the Brisbane ymd + hour back out of a stored instant. */
export function splitNeededBy(iso: string): { ymd: string; hour: number } {
  const local = new Date(Date.parse(iso) + OFFSET_MS)
  return { ymd: local.toISOString().slice(0, 10), hour: local.getUTCHours() }
}

/** "By 10am Thu", or "By open tomorrow" when it is the next day. */
export function formatNeededBy(iso: string, now = new Date()): string {
  const { ymd, hour } = splitNeededBy(iso)
  const time = NEEDED_BY_TIMES.find((t) => t.hour === hour)?.label.toLowerCase() ??
    `${((hour + 11) % 12) + 1}${hour < 12 ? "am" : "pm"}`
  const today = brisbaneYmd(now)
  const tomorrow = brisbaneYmd(new Date(now.getTime() + 86400_000))
  const day =
    ymd === today ? "today" : ymd === tomorrow ? "tomorrow" : DAY[new Date(`${ymd}T00:00:00Z`).getUTCDay()]
  return `By ${time} ${day}`
}

export function isLate(iso: string, now = new Date()): boolean {
  return Date.parse(iso) < now.getTime()
}
