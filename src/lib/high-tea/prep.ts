/**
 * Tea Garden high tea prep list, the pure part.
 *
 * Chloe, 5 Oct 2026: pastry for the Tea Garden is ordered off the number of
 * high tea bookings. Generate the list 48 hours out, update it 24 hours
 * out, check it 12 hours out. On top of the bookings, 4 extra of each item
 * on a weekday (two whole stands) and 8 on a weekend, for walk-ins.
 */

export type HighTeaStage = "48H" | "24H" | "12H"

export const STAGES: Record<HighTeaStage, { label: string; out: string }> = {
  "48H": { label: "First list", out: "48 hours out" },
  "24H": { label: "Updated list", out: "24 hours out" },
  "12H": { label: "Final check", out: "12 hours out" },
}

export const WEEKDAY_EXTRA = 4
export const WEEKEND_EXTRA = 8

/** Bookings in these states are not coming. */
const NOT_COMING = new Set(["cancelled", "no show"])

export interface HighTeaBooking {
  ref: string
  /** "09:30" */
  time: string
  pax: number
  name: string
  status: string
  notes: string | null
  tags: string | null
}

export interface StandItem {
  name: string
  perGuest: number
}

export interface BookingLine extends HighTeaBooking {
  /** Guests having the full high tea: the day-before check, else everyone booked. */
  highTeaPax: number
  checked: boolean
  unconfirmed: boolean
}

export interface PrepLine {
  name: string
  forBookings: number
  extra: number
  total: number
}

export interface HighTeaDay {
  /** YYYY-MM-DD, Brisbane. */
  day: string
  weekend: boolean
  extra: number
  bookings: BookingLine[]
  /** Everyone booked on a high tea booking that is still coming. */
  bookedGuests: number
  /** Guests the list is built for, after the day-before checks. */
  guests: number
  unconfirmedGuests: number
  uncheckedBookings: number
  lines: PrepLine[]
}

/** Saturday or Sunday. `day` is a plain calendar date, so no timezone maths. */
export function isWeekend(day: string): boolean {
  const dow = new Date(`${day}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

export function extraFor(day: string): number {
  return isWeekend(day) ? WEEKEND_EXTRA : WEEKDAY_EXTRA
}

export function buildHighTeaDay(
  day: string,
  bookings: HighTeaBooking[],
  checks: Map<string, number>,
  items: StandItem[]
): HighTeaDay {
  const coming = bookings
    .filter((b) => !NOT_COMING.has(b.status.trim().toLowerCase()))
    .sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name))
  const lines: BookingLine[] = coming.map((b) => {
    const check = checks.get(b.ref)
    const checked = check !== undefined
    // A check can never add guests the booking does not have.
    const highTeaPax = checked ? Math.max(0, Math.min(check, b.pax)) : b.pax
    return { ...b, highTeaPax, checked, unconfirmed: b.status.trim().toLowerCase() === "unconfirmed" }
  })
  const guests = lines.reduce((n, b) => n + b.highTeaPax, 0)
  const extra = extraFor(day)
  return {
    day,
    weekend: isWeekend(day),
    extra,
    bookings: lines,
    bookedGuests: lines.reduce((n, b) => n + b.pax, 0),
    guests,
    unconfirmedGuests: lines.filter((b) => b.unconfirmed).reduce((n, b) => n + b.highTeaPax, 0),
    uncheckedBookings: lines.filter((b) => !b.checked).length,
    lines: items.map((i) => {
      const forBookings = Math.ceil(guests * i.perGuest - 1e-9)
      return { name: i.name, forBookings, extra, total: forBookings + extra }
    }),
  }
}

export interface SnapshotItem {
  name: string
  total: number
}

export interface LineChange {
  name: string
  before: number | null
  now: number
  delta: number
}

/** What moved since an earlier list. Items new to the stand count from zero. */
export function changesSince(before: SnapshotItem[], now: SnapshotItem[]): LineChange[] {
  const prev = new Map(before.map((i) => [i.name, i.total]))
  return now
    .map((i) => {
      const b = prev.get(i.name)
      return { name: i.name, before: b ?? null, now: i.total, delta: i.total - (b ?? 0) }
    })
    .filter((c) => c.delta !== 0)
}

/** "+6" / "-4" for a table cell. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

/** Brisbane calendar day `offset` days from `now`. Brisbane has no daylight saving. */
export function brisbaneDay(offset = 0, now = new Date()): string {
  return new Date(now.getTime() + 10 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

export function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  })
}

/** "9:30 am" from "09:30". */
export function niceTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number)
  const ampm = h >= 12 ? "pm" : "am"
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${ampm}`
}

/** How the day-before check reads on a booking. */
export function checkLabel(b: BookingLine): string {
  if (!b.checked) return "Not checked yet"
  if (b.highTeaPax === 0) return "Not having high tea"
  if (b.highTeaPax === b.pax) return "Full high tea"
  return `High tea for ${b.highTeaPax} of ${b.pax}`
}
