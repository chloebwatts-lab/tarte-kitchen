/**
 * Pastry Orders (Shawna, 28 Nov 2026): the pure rules of her Claude tracker,
 * rebuilt inside Staff tools. Field names and ids are the tracker's own so
 * old and new line up. Unit tested in shared.test.ts; the database side is
 * src/lib/actions/pastry-orders.ts and the scan intake ./intake.ts.
 *
 * Rows are order LINES. A card is every line of one order number on one
 * pickup day. Nothing is ever deleted: cancel and refund are staffStatus.
 */

export interface PastryLine {
  id: string
  order: string
  customer: string
  /** "Burleigh" or "Currumbin" */
  venue: string
  /** "YYYY-MM-DD" Brisbane day, or "" */
  date: string
  /** "HH:MM" 24 hour, or "" */
  time: string
  item: string
  qty: number
  price: number
  contact: string
  notes: string
  flag: string
  flagKind: string
  /** active | cancelled (the customer cancelled by email) */
  status: string
  source: string
  channel: string
  payment: string
  takenBy: string
  /** "" | cancelled | refunded | notcollected */
  staffStatus: string
  staffStatusBy: string
  staffStatusAt: string
  staffStatusNote: string
  changeNote: string
  pickedUp: boolean
  pickedUpBy: string
  pickedUpAt: string
  flagResolved: boolean
  resolvedBy: string
  resolvedAt: string
  resolvedNote: string
  updatedAt: string
}

export interface PastryLogEntry {
  id: string
  at: string
  order: string
  customer: string
  action: string
  detail: string
  by: string
  byId: string
}

export const PASTRY_VENUES = ["Burleigh", "Currumbin"] as const
export type PastryVenue = (typeof PASTRY_VENUES)[number]

export const PAYMENTS = ["Paid", "Deposit paid", "Pay on pickup"] as const
export const CHANNELS = ["In store", "Phone", "Custom request"] as const

/** What the inbox scan may write on a row that already exists. */
export const SCAN_FIELDS = ["order", "customer", "venue", "date", "time", "item", "qty", "price", "contact", "notes", "flag", "flagKind", "status", "source", "updatedAt"] as const
/** Written only by staff in the app. The scan never changes these on an existing row. */
export const STAFF_FIELDS = [
  "channel",
  "payment",
  "takenBy",
  "staffStatus",
  "staffStatusBy",
  "staffStatusAt",
  "staffStatusNote",
  "changeNote",
  "pickedUp",
  "pickedUpBy",
  "pickedUpAt",
  "flagResolved",
  "resolvedBy",
  "resolvedAt",
  "resolvedNote",
] as const

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

/** Brisbane calendar day (no daylight saving), offset in days. */
export function brisbaneDay(now = new Date(), offset = 0): string {
  return new Date(now.getTime() + 10 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

/** "2026-11-28T18:13:05+10:00", the way the tracker stamps things. */
export function brisbaneIso(now = new Date()): string {
  return `${new Date(now.getTime() + 10 * 3_600_000).toISOString().slice(0, 19)}+10:00`
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export function validDay(v: unknown): string {
  if (typeof v !== "string" || !DAY_RE.test(v)) return ""
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? "" : v
}

export function validTime(v: unknown): string {
  if (typeof v !== "string") return ""
  const m = v.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i)
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return ""
  let h = Number(m[1])
  const ap = (m[3] ?? "").toLowerCase()
  if (ap) {
    if (h < 1 || h > 12) return ""
    if (ap === "pm" && h < 12) h += 12
    if (ap === "am" && h === 12) h = 0
  }
  return `${String(h).padStart(2, "0")}:${m[2]}`
}

/** House rule: no long dashes on screen. A dash between words reads as a comma. */
export function plain(v: unknown, max = 600): string {
  if (typeof v !== "string") return ""
  return v
    .replace(/\s*[\u2013\u2014]\s*/g, ", ")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, max)
}

/** "13:00" to "1pm", "11:30" to "11:30am". */
export function niceTime(t: string): string {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  if (!Number.isFinite(h)) return ""
  const ap = h >= 12 ? "pm" : "am"
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m ? `${h12}:${String(m).padStart(2, "0")}${ap}` : `${h12}${ap}`
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

/** "Saturday 28 November" */
export function longDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "Sat 28 Nov" */
export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return day
  return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`
}

/** "Today, Sat 28 Nov" / "Tomorrow, Sun 29 Nov" / "Mon 30 Nov" */
export function dayHeading(day: string, today: string): string {
  if (!day) return "No date yet"
  if (day === today) return `Today, ${shortDay(day)}`
  if (day === addDays(today, 1)) return `Tomorrow, ${shortDay(day)}`
  return shortDay(day)
}

/** Items starting "Celebration cake" are cake orders. Baked ricotta cheesecake is a pastry item. */
export function isCake(item: string): boolean {
  return /^\s*celebration cake/i.test(item)
}

/** "Celebration cake 6in raspberries dulce de leche" to "6in raspberries dulce de leche". */
export function cakeLabel(item: string): string {
  const rest = item.replace(/^\s*celebration cake\s*[:,-]?\s*/i, "").trim()
  return rest || "Celebration cake"
}

/** Gift cards, vouchers and refunds never show (the scan leaves them out; this is the backstop). */
export function isHiddenItem(item: string): boolean {
  return /\bgift\s*(card|voucher)|\bvoucher\b|\brefund\b|\be-?gift\b/i.test(item)
}

/** Open = pickup today or later, or no date yet. Customer-cancelled rows and hidden items drop out. */
export function openLines(lines: PastryLine[], today: string): PastryLine[] {
  return lines.filter((l) => l.status !== "cancelled" && !isHiddenItem(l.item) && (!l.date || l.date >= today))
}

export type CardState = "cancelled" | "refunded" | "pickedup" | "notcollected" | "attention" | "confirmed"

export const STATE_LABEL: Record<CardState, string> = {
  cancelled: "Cancelled",
  refunded: "Refunded",
  pickedup: "Picked up",
  notcollected: "Not collected",
  attention: "Needs attention",
  confirmed: "Confirmed",
}

export interface PastryCard {
  /** order + "|" + date */
  key: string
  order: string
  date: string
  time: string
  customer: string
  venue: string
  lines: PastryLine[]
  cake: boolean
  state: CardState
  /** Cancelled or refunded: greyed out, out of counts, prep totals and the cake panel. */
  dead: boolean
  /** Open flags (not resolved), one sentence each. */
  flags: string[]
  /** Any flag at all, resolved or not (for "Undo flag resolve"). */
  resolved: { by: string; at: string; note: string } | null
  notes: string[]
  contact: string
  changeNote: string
  sourceLine: string
}

const lineNo = (id: string): number => {
  const m = id.match(/-(\d+)$/)
  return m ? Number(m[1]) : 0
}

/** "Online order · Paid online", "Phone order · taken by Jess · Deposit paid" */
export function sourceLine(l: Pick<PastryLine, "source" | "channel" | "payment" | "takenBy">): string {
  const parts: string[] = []
  if (l.source === "Squarespace") {
    parts.push("Online order", l.payment || "Paid online")
  } else if (l.source === "Manual") {
    const ch = l.channel || "In store"
    parts.push(ch === "Custom request" ? "Custom request" : `${ch} order`)
    if (l.takenBy) parts.push(`taken by ${l.takenBy}`)
    if (l.payment) parts.push(l.payment)
  } else if (l.source === "Now Book It") {
    parts.push("Now Book It booking")
    if (l.payment) parts.push(l.payment)
  } else {
    parts.push("Email order")
    if (l.payment) parts.push(l.payment)
  }
  return parts.join(" · ")
}

export function groupCards(lines: PastryLine[]): PastryCard[] {
  const map = new Map<string, PastryLine[]>()
  for (const l of lines) {
    const key = `${l.order}|${l.date}`
    map.set(key, [...(map.get(key) ?? []), l])
  }
  const cards: PastryCard[] = []
  for (const [key, group] of map) {
    const ls = [...group].sort((a, b) => lineNo(a.id) - lineNo(b.id) || a.id.localeCompare(b.id))
    const first = ls[0]
    const staff = ls.find((l) => l.staffStatus)?.staffStatus ?? ""
    const flags = [...new Set(ls.filter((l) => l.flag && !l.flagResolved).map((l) => plain(l.flag)))]
    const res = ls.find((l) => l.flag && l.flagResolved)
    const state: CardState =
      staff === "cancelled"
        ? "cancelled"
        : staff === "refunded"
          ? "refunded"
          : ls.every((l) => l.pickedUp)
            ? "pickedup"
            : staff === "notcollected"
              ? "notcollected"
              : flags.length
                ? "attention"
                : "confirmed"
    cards.push({
      key,
      order: first.order,
      date: first.date,
      time: ls.map((l) => l.time).filter(Boolean).sort()[0] ?? "",
      customer: plain(ls.find((l) => l.customer)?.customer ?? "", 120),
      venue: ls.find((l) => l.venue)?.venue ?? "",
      lines: ls,
      cake: ls.some((l) => isCake(l.item)),
      state,
      dead: state === "cancelled" || state === "refunded",
      flags,
      resolved: res ? { by: res.resolvedBy, at: res.resolvedAt, note: res.resolvedNote } : null,
      notes: [...new Set(ls.map((l) => plain(l.notes)).filter(Boolean))],
      contact: ls.find((l) => l.contact)?.contact ?? "",
      changeNote: ls.find((l) => l.changeNote)?.changeNote ?? "",
      sourceLine: sourceLine(first),
    })
  }
  return sortCards(cards)
}

/** Day (no date first, so it is seen), then time (no time first), then name. */
export function sortCards(cards: PastryCard[]): PastryCard[] {
  return [...cards].sort(
    (a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.customer.localeCompare(b.customer) || a.order.localeCompare(b.order)
  )
}

export type VenueFilter = "Both" | PastryVenue

export function byVenue(cards: PastryCard[], venue: VenueFilter): PastryCard[] {
  return venue === "Both" ? cards : cards.filter((c) => c.venue === venue)
}

export type ShowKey = "today" | "tomorrow" | "next7" | "cakes" | "attention" | "all" | `day:${string}`

/** Next 7 days = today and the six days after. */
export function inNext7(day: string, today: string): boolean {
  return !!day && day >= today && day <= addDays(today, 6)
}

/** The cards one Show choice lists (dead ones stay, greyed). */
export function showCards(cards: PastryCard[], show: ShowKey, today: string): PastryCard[] {
  if (show === "today") return cards.filter((c) => c.date === today)
  if (show === "tomorrow") return cards.filter((c) => c.date === addDays(today, 1))
  if (show === "next7") return cards.filter((c) => inNext7(c.date, today))
  if (show === "cakes") return cards.filter((c) => c.cake)
  if (show === "attention") return cards.filter((c) => c.state === "attention")
  if (show === "all") return cards
  const day = show.slice(4)
  return cards.filter((c) => c.date === day)
}

export interface PastryCounts {
  today: number
  tomorrow: number
  next7: number
  cakes: number
  attention: number
  all: number
  /** Every day with orders, and how many. "" is "no date yet". */
  days: { day: string; count: number }[]
}

/** Counts leave out cancelled and refunded orders. */
export function countCards(cards: PastryCard[], today: string): PastryCounts {
  const live = cards.filter((c) => !c.dead)
  const days = new Map<string, number>()
  for (const c of live) days.set(c.date, (days.get(c.date) ?? 0) + 1)
  const n = (show: ShowKey) => showCards(live, show, today).length
  return {
    today: n("today"),
    tomorrow: n("tomorrow"),
    next7: n("next7"),
    cakes: n("cakes"),
    attention: n("attention"),
    all: live.length,
    days: [...days.entries()].map(([day, count]) => ({ day, count })).sort((a, b) => a.day.localeCompare(b.day)),
  }
}

export interface MakeColumn {
  venue: string
  total: number
  items: { item: string; qty: number }[]
}

/**
 * The To make box: item totals by venue, biggest first. Cancelled and
 * refunded orders are out; not collected stays in (it was still made).
 */
export function toMake(cards: PastryCard[], venue: VenueFilter = "Both"): MakeColumn[] {
  const venues = venue === "Both" ? [...PASTRY_VENUES] : [venue]
  return venues.map((v) => {
    const totals = new Map<string, number>()
    for (const c of cards) {
      if (c.dead || c.venue !== v) continue
      for (const l of c.lines) {
        const name = plain(l.item, 200)
        if (!name) continue
        totals.set(name, (totals.get(name) ?? 0) + (Number(l.qty) || 0))
      }
    }
    const items = [...totals.entries()].map(([item, qty]) => ({ item, qty })).sort((a, b) => b.qty - a.qty || a.item.localeCompare(b.item))
    return { venue: v, total: items.reduce((s, i) => s + i.qty, 0), items }
  })
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** "Today, Saturday 28 November: 9 items to make, 3 pickups, 1 cake" */
export function todayLine(cards: PastryCard[], today: string): string {
  const live = cards.filter((c) => c.date === today && !c.dead)
  const items = toMake(live).reduce((s, c) => s + c.total, 0)
  const cakes = live.filter((c) => c.cake).length
  return `Today, ${longDay(today)}: ${plural(items, "item")} to make, ${plural(live.length, "pickup")}, ${plural(cakes, "cake")}`
}

export interface CakeStrip {
  key: string
  when: "Due today" | "Due tomorrow" | "Due in 2 days"
  text: string
}

/** Gold strips for cakes due today, tomorrow or in 2 days. */
export function cakeStrips(cards: PastryCard[], today: string): CakeStrip[] {
  const labels = ["Due today", "Due tomorrow", "Due in 2 days"] as const
  const out: CakeStrip[] = []
  for (let i = 0; i < 3; i++) {
    const day = addDays(today, i)
    for (const c of cards) {
      if (c.dead || !c.cake || c.date !== day || c.state === "pickedup") continue
      const what = c.lines.filter((l) => isCake(l.item)).map((l) => cakeLabel(plain(l.item, 200))).join(", ")
      const bits = [c.customer, what.charAt(0).toLowerCase() + what.slice(1), niceTime(c.time), c.venue].filter(Boolean)
      out.push({ key: c.key, when: labels[i], text: `${bits.join(", ")}${c.state === "attention" ? " (needs attention)" : ""}` })
    }
  }
  return out
}

/** Customer, order number or item, across every open order. */
export function searchCards(cards: PastryCard[], q: string): PastryCard[] {
  const needle = q.trim().toLowerCase().replace(/^#/, "")
  if (!needle) return cards
  return cards.filter(
    (c) => c.customer.toLowerCase().includes(needle) || c.order.toLowerCase().includes(needle) || c.lines.some((l) => l.item.toLowerCase().includes(needle))
  )
}

/** (9999999999999 minus Unix ms, 13 digits) + "-" + order: the newest sorts first. */
export function logId(nowMs: number, order: string): string {
  return `${String(9999999999999 - Math.floor(nowMs)).padStart(13, "0")}-${order}`
}

/** Unix ms a log id was made at, or null. */
export function logIdMs(id: string): number | null {
  const m = id.match(/^(\d{13})-/)
  return m ? 9999999999999 - Number(m[1]) : null
}

const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Manual order number: "M" + 6 characters. */
export function manualOrderNo(rand: () => number = Math.random): string {
  let s = "M"
  for (let i = 0; i < 6; i++) s += ID_CHARS[Math.floor(rand() * ID_CHARS.length) % ID_CHARS.length]
  return s
}

/** NEW or UPDATED on a card: the unseen log entries for that order. */
export function cardTag(order: string, unseen: PastryLogEntry[]): "NEW" | "UPDATED" | null {
  const mine = unseen.filter((e) => e.order === order)
  if (!mine.length) return null
  return mine.some((e) => e.action === "Added") ? "NEW" : "UPDATED"
}

/** Log entries newer than the person's last look. First visit: the last 24 hours. */
export function unseenEntries(log: PastryLogEntry[], lastSeenMs: number | null, nowMs: number): PastryLogEntry[] {
  const since = lastSeenMs ?? nowMs - 24 * 3_600_000
  return log.filter((e) => {
    const t = Date.parse(e.at)
    return Number.isFinite(t) && t > since
  })
}

export const LOG_ACTIONS = [
  "Added",
  "Changed",
  "Flagged",
  "Cancelled",
  "Refunded",
  "Not collected",
  "Restored",
  "Picked up",
  "Pickup undone",
  "Flag resolved",
  "Flag reopened",
  "PIN changed",
  "On file",
] as const

/** Colour of the action word in the activity log. */
export function actionTone(action: string): "green" | "amber" | "red" | "ink" {
  if (action === "Picked up" || action === "Flag resolved" || action === "Added" || action === "Restored") return "green"
  if (action === "Flagged" || action === "Changed" || action === "Flag reopened" || action === "Pickup undone") return "amber"
  if (action === "Cancelled" || action === "Refunded" || action === "Not collected") return "red"
  return "ink"
}

// ---------------------------------------------------------------------------
// Scan intake: clean what the inbox scan posts.

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" && Number.isFinite(v) ? String(v) : "")
const num = (v: unknown, fallback: number): number => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : fallback
}
const bool = (v: unknown): boolean => v === true || v === "true"

/** Ids are one path segment of letters, digits and _ - . ~ : @ + (the tracker's own rule). */
export function validId(v: unknown): string {
  return typeof v === "string" && /^[A-Za-z0-9_\-.~:@+]{1,200}$/.test(v) ? v : ""
}

export function venueName(v: unknown): string {
  const t = str(v, 40).toLowerCase()
  if (t.startsWith("burleigh")) return "Burleigh"
  if (t.startsWith("currumbin") || t.includes("beach house")) return "Currumbin"
  return ""
}

/** One posted order line as a full row, or null when it has no usable id. */
export function cleanLine(raw: unknown): PastryLine | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = validId(r.id)
  if (!id) return null
  const staffStatus = str(r.staffStatus, 20)
  return {
    id,
    order: str(r.order, 80) || id.replace(/-\d+$/, ""),
    customer: str(r.customer, 160),
    venue: venueName(r.venue),
    date: validDay(r.date),
    time: validTime(r.time),
    item: str(r.item, 400),
    qty: num(r.qty, 1),
    price: num(r.price, 0),
    contact: str(r.contact, 300),
    notes: str(r.notes, 2000),
    flag: str(r.flag, 600),
    flagKind: str(r.flagKind, 20),
    status: str(r.status, 20) === "cancelled" ? "cancelled" : "active",
    source: str(r.source, 40),
    channel: str(r.channel, 40),
    payment: str(r.payment, 40),
    takenBy: str(r.takenBy, 80),
    staffStatus: ["cancelled", "refunded", "notcollected"].includes(staffStatus) ? staffStatus : "",
    staffStatusBy: str(r.staffStatusBy, 80),
    staffStatusAt: str(r.staffStatusAt, 40),
    staffStatusNote: str(r.staffStatusNote, 600),
    changeNote: str(r.changeNote, 600),
    pickedUp: bool(r.pickedUp),
    pickedUpBy: str(r.pickedUpBy, 80),
    pickedUpAt: str(r.pickedUpAt, 40),
    flagResolved: bool(r.flagResolved),
    resolvedBy: str(r.resolvedBy, 80),
    resolvedAt: str(r.resolvedAt, 40),
    resolvedNote: str(r.resolvedNote, 600),
    updatedAt: str(r.updatedAt, 40),
  }
}

export function cleanLog(raw: unknown): PastryLogEntry | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as Record<string, unknown>
  const id = validId(r.id)
  const action = str(r.action, 40)
  if (!id || !action) return null
  return {
    id,
    at: str(r.at, 40) || (logIdMs(id) ? brisbaneIso(new Date(logIdMs(id) as number)) : ""),
    order: str(r.order, 80),
    customer: str(r.customer, 160),
    action,
    detail: str(r.detail, 1000),
    by: str(r.by, 80),
    byId: str(r.byId, 80),
  }
}

/**
 * What a scan post may change on a row that is already there: only the scan's
 * own fields, and nothing at all on a Manual row. Staff-owned fields are
 * never in the result. Null means leave the row alone.
 */
export function scanPatch(existing: PastryLine, incoming: PastryLine): Partial<PastryLine> | null {
  if (existing.source === "Manual") return null
  const patch: Record<string, unknown> = {}
  for (const k of SCAN_FIELDS) {
    if (k === "updatedAt") continue
    if (existing[k] !== incoming[k]) patch[k] = incoming[k]
  }
  if (!Object.keys(patch).length) return null
  patch.updatedAt = incoming.updatedAt || existing.updatedAt
  return patch as Partial<PastryLine>
}

// ---------------------------------------------------------------------------
// Alerts (phone pushes to pastry devices).

const itemsText = (lines: PastryLine[], max = 3): string => {
  const parts = lines.slice(0, max).map((l) => `${Number(l.qty) || 1}x ${plain(l.item, 80)}`)
  return `${parts.join(", ")}${lines.length > max ? ` and ${lines.length - max} more` : ""}`
}

const whenText = (c: Pick<PastryCard, "date" | "time">, today: string): string => {
  const day = !c.date ? "no date yet" : c.date === today ? "today" : c.date === addDays(today, 1) ? "tomorrow" : shortDay(c.date)
  return [day, niceTime(c.time)].filter(Boolean).join(" ")
}

export interface PushText {
  title: string
  body: string
}

export function newOrderPush(card: PastryCard, today: string): PushText {
  return {
    title: `New ${card.cake ? "cake" : "pastry"} order: ${card.customer || `#${card.order}`}`,
    body: `${itemsText(card.lines)}. Pickup ${whenText(card, today)}${card.venue ? `, ${card.venue}` : ""}.`,
  }
}

export function flagPush(card: PastryCard, detail: string, today: string): PushText {
  return {
    title: `Needs attention: ${card.customer || `#${card.order}`}`,
    body: `${plain(detail || card.flags[0] || "Check this order", 200)} Pickup ${whenText(card, today)}${card.venue ? `, ${card.venue}` : ""}.`,
  }
}

/** Afternoon before: every celebration cake due tomorrow. Null when there are none. */
export function cakesTomorrowPush(cards: PastryCard[], today: string): PushText | null {
  const due = cards.filter((c) => !c.dead && c.cake && c.date === addDays(today, 1) && c.state !== "pickedup")
  if (!due.length) return null
  const lines = due.slice(0, 4).map((c) => {
    const what = c.lines.filter((l) => isCake(l.item)).map((l) => cakeLabel(plain(l.item, 80))).join(", ")
    return [c.customer, what, niceTime(c.time), c.venue].filter(Boolean).join(", ")
  })
  return {
    title: `${plural(due.length, "cake")} due tomorrow`,
    body: `${lines.join("; ")}${due.length > 4 ? ` and ${due.length - 4} more` : ""}.`,
  }
}

/** About 6:30am: what to make today, by venue. Null when nothing is on. */
export function morningPush(cards: PastryCard[], today: string): PushText | null {
  const live = cards.filter((c) => !c.dead && c.date === today)
  if (!live.length) return null
  const cols = toMake(live).filter((c) => c.total > 0)
  const cakes = live.filter((c) => c.cake).length
  const attention = cards.filter((c) => !c.dead && c.state === "attention" && inNext7(c.date, today)).length
  const body = [
    ...cols.map((c) => `${c.venue}: ${plural(c.total, "item")}`),
    cakes ? plural(cakes, "cake") : null,
    attention ? `${attention} need attention this week` : null,
  ]
    .filter(Boolean)
    .join(". ")
  return { title: `Pastry orders today: ${plural(live.length, "pickup")}`, body: `${body}.` }
}

// ---------------------------------------------------------------------------
// Upcoming events feed (Tarte Shifts kiosk pop up and lists).

export interface PastryFeedRow {
  id: string
  venue: "BURLEIGH" | "BEACH_HOUSE"
  date: string
  time: string
  title: string
  notes: string | null
  flagged: boolean
}

/**
 * Pastry orders still to be picked up in a day range, one per card. Picked
 * up, not collected, cancelled and refunded are out.
 */
export function pastryFeedRows(lines: PastryLine[], from: string, to: string): PastryFeedRow[] {
  const cards = groupCards(lines.filter((l) => l.status !== "cancelled" && !isHiddenItem(l.item) && l.date >= from && l.date <= to && !!l.date))
  const out: PastryFeedRow[] = []
  for (const c of cards) {
    if (c.dead || c.state === "pickedup" || c.state === "notcollected") continue
    const notes = [c.flags.length ? `Needs attention: ${c.flags.join(" ")}` : null, ...c.notes, c.changeNote ? `Changed: ${c.changeNote}` : null].filter(Boolean)
    out.push({
      id: `pastry:${c.order}:${c.date}`,
      venue: c.venue === "Currumbin" ? "BEACH_HOUSE" : "BURLEIGH",
      date: c.date,
      time: c.time,
      title: plain(`${c.customer || `Order ${c.order}`}, ${itemsText(c.lines, 4)}`, 240),
      notes: notes.length ? plain(notes.join(". "), 400) : null,
      flagged: c.flags.length > 0,
    })
  }
  return out
}
