/**
 * Cake orders: the pure rules (grouping, short notice, alert wording, input
 * cleaning). Unit tested in shared.test.ts; the database side is
 * src/lib/actions/cake-orders.ts and the website import src/lib/cakes/import.ts.
 */

export type CakeVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
export type CakeStatus = "NEW" | "SEEN" | "READY" | "COLLECTED" | "CANCELLED"

export const CAKE_VENUES: CakeVenue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
export const CAKE_VENUE_LABEL: Record<CakeVenue, string> = {
  BURLEIGH: "Burleigh",
  BEACH_HOUSE: "Currumbin",
  TEA_GARDEN: "Tea Garden",
}

/** The website asks for at least 3 days' notice (Chloe, 29 Jul 2026). */
export const MIN_NOTICE_DAYS = 3

export const MAX_SHORT = 120
export const MAX_LONG = 600

export function isCakeVenue(v: unknown): v is CakeVenue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export function isCakeStatus(v: unknown): v is CakeStatus {
  return v === "NEW" || v === "SEEN" || v === "READY" || v === "COLLECTED" || v === "CANCELLED"
}

/** Trim, collapse spaces (keeping line breaks in long text), cap; empty is null. */
export function clean(v: unknown, max: number, multiline = false): string | null {
  if (typeof v !== "string") return null
  const t = multiline
    ? v.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim()
    : v.replace(/\s+/g, " ").trim()
  return t ? t.slice(0, max) : null
}

export function cleanDay(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

export function cleanTime(v: unknown): string | null {
  if (typeof v !== "string") return null
  const m = v.trim().match(/^(\d{1,2}):(\d{2})/)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null
  return `${m[1].padStart(2, "0")}:${m[2]}`
}

export function cleanQty(v: unknown): number {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 500) : 1
}

/** Brisbane calendar day (no daylight saving), offset in days. */
export function brisbaneDay(now = new Date(), offset = 0): string {
  return new Date(now.getTime() + 10 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000)
}

/** Ordered less than 3 days ahead of pickup. */
export function isShortNotice(orderedDay: string, pickupDay: string | null): boolean {
  return !!pickupDay && daysBetween(orderedDay, pickupDay) < MIN_NOTICE_DAYS
}

/** "13:00" to "1pm", "08:30" to "8:30am". */
export function niceTime(t: string | null): string | null {
  if (!t) return null
  const [h, m] = t.split(":").map(Number)
  const ap = h >= 12 ? "pm" : "am"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}`
}

/** "Sun 29 Nov" */
export function shortDay(day: string): string {
  return new Date(`${day}T00:00:00Z`)
    .toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .replace(",", "")
}

/** "Today", "Tomorrow", or "Sunday 29 November". */
export function dayHeading(day: string, today: string): string {
  const diff = daysBetween(today, day)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
}

export interface GroupableOrder {
  id: string
  pickupDate: string | null
  pickupTime: string | null
  status: CakeStatus
  orderRef: string | null
}

export interface DayGroup<T> {
  key: string
  title: string
  tone: "alert" | "today" | "normal"
  orders: T[]
}

const byTime = <T extends GroupableOrder>(a: T, b: T) =>
  (a.pickupTime ?? "99").localeCompare(b.pickupTime ?? "99") || (a.orderRef ?? "").localeCompare(b.orderRef ?? "") || a.id.localeCompare(b.id)

/**
 * Upcoming list: no date yet first, then anything past its day that was
 * never marked collected, then today onwards day by day. Collected and
 * cancelled orders from before today drop off (the "Past" view has them).
 */
export function groupUpcoming<T extends GroupableOrder>(orders: T[], today: string): DayGroup<T>[] {
  const noDate = orders.filter((o) => !o.pickupDate && o.status !== "CANCELLED" && o.status !== "COLLECTED")
  const overdue = orders.filter(
    (o) => o.pickupDate && o.pickupDate < today && o.status !== "COLLECTED" && o.status !== "CANCELLED"
  )
  const days = new Map<string, T[]>()
  for (const o of orders) {
    if (!o.pickupDate || o.pickupDate < today) continue
    days.set(o.pickupDate, [...(days.get(o.pickupDate) ?? []), o])
  }
  const groups: DayGroup<T>[] = []
  if (noDate.length) groups.push({ key: "nodate", title: "No pickup date yet", tone: "alert", orders: noDate.sort(byTime) })
  if (overdue.length) {
    groups.push({
      key: "overdue",
      title: "Past pickup day, not marked collected",
      tone: "alert",
      orders: overdue.sort((a, b) => (a.pickupDate ?? "").localeCompare(b.pickupDate ?? "") || byTime(a, b)),
    })
  }
  for (const day of [...days.keys()].sort()) {
    groups.push({ key: day, title: dayHeading(day, today), tone: day === today ? "today" : "normal", orders: days.get(day)!.sort(byTime) })
  }
  return groups
}

export interface AlertOrder {
  venue: CakeVenue
  pickupDate: string | null
  pickupTime: string | null
  customerName: string
  product: string
  details: string | null
  quantity: number
  status: CakeStatus
  checkNote: string | null
  orderedDay: string
}

function itemLine(o: Pick<AlertOrder, "quantity" | "product" | "details">): string {
  return `${o.quantity > 1 ? `${o.quantity} x ` : ""}${o.product}${o.details ? ` (${o.details})` : ""}`
}

function whenWhere(o: AlertOrder, today: string): string {
  const day = o.pickupDate ? (o.pickupDate === today ? "today" : daysBetween(today, o.pickupDate) === 1 ? "tomorrow" : shortDay(o.pickupDate)) : "no date yet"
  return [day, niceTime(o.pickupTime), CAKE_VENUE_LABEL[o.venue]].filter(Boolean).join(", ")
}

/** One alert for one or more new orders (several items of one website order arrive together). */
export function newOrderAlert(orders: AlertOrder[], today: string): { title: string; body: string } {
  const first = orders[0]
  const short = orders.some((o) => isShortNotice(o.orderedDay, o.pickupDate))
  const check = orders.some((o) => o.checkNote || !o.pickupDate)
  const title = `New cake order${orders.length > 1 ? `, ${orders.length} items` : ""}: ${whenWhere(first, today)}`
  const body = [
    `${orders.map(itemLine).join("; ")} for ${first.customerName}.`,
    short ? `Short notice (under ${MIN_NOTICE_DAYS} days).` : null,
    check ? "Needs checking before you make it." : null,
  ]
    .filter(Boolean)
    .join(" ")
  return { title, body }
}

export function changedAlert(o: AlertOrder, today: string, cancelled: boolean): { title: string; body: string } {
  return {
    title: `${cancelled ? "Cake order cancelled" : "Cake order changed"}: ${whenWhere(o, today)}`,
    body: `${itemLine(o)} for ${o.customerName}.`,
  }
}

/** The 6am list. Null when there is nothing to say. */
export function morningAlert(orders: AlertOrder[], today: string, lookAheadDays = 3): { title: string; body: string } | null {
  const live = orders.filter((o) => o.status !== "CANCELLED" && o.status !== "COLLECTED")
  const todays = live.filter((o) => o.pickupDate === today).sort((a, b) => (a.pickupTime ?? "99").localeCompare(b.pickupTime ?? "99"))
  const soon = live.filter((o) => o.pickupDate && o.pickupDate > today && daysBetween(today, o.pickupDate) <= lookAheadDays)
  const noDate = live.filter((o) => !o.pickupDate)
  const unopened = live.filter((o) => o.status === "NEW")
  if (!todays.length && !soon.length && !noDate.length) return null
  const title = todays.length ? `Cakes today: ${todays.length}` : "No cakes out today"
  const parts: string[] = []
  if (todays.length) {
    parts.push(todays.map((o) => `${[niceTime(o.pickupTime), CAKE_VENUE_LABEL[o.venue]].filter(Boolean).join(" ")} ${itemLine(o)}`).join("; ") + ".")
  }
  if (soon.length) parts.push(`Next ${lookAheadDays} days: ${soon.length}.`)
  if (noDate.length) parts.push(`${noDate.length} with no pickup date.`)
  if (unopened.length) parts.push(`${unopened.length} not opened yet.`)
  return { title, body: parts.join(" ") }
}

/** Still NEW two hours after it came in, during pastry hours: one more nudge. */
export const REMIND_AFTER_MIN = 120

export function dueForReminder(o: { status: CakeStatus; createdAt: Date; remindedAt: Date | null }, now: Date): boolean {
  if (o.status !== "NEW" || o.remindedAt) return false
  if (now.getTime() - o.createdAt.getTime() < REMIND_AFTER_MIN * 60_000) return false
  const hour = Number(new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(11, 13))
  return hour >= 7 && hour < 15
}
