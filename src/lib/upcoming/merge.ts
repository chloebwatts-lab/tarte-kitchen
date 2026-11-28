/**
 * Upcoming events feed for Tarte Shifts (GET /api/internal/upcoming-events):
 * functions and cake pickups so venue managers cannot miss one.
 *
 * Pure: the route reads the rows (src/lib/upcoming/load.ts) and this file
 * turns them into one sorted list. Unit tested in merge.test.ts against the
 * real hello@ calendar and invoices of 28 Nov 2026.
 *
 * Functions come from two places:
 *  - tarte-inbox's function invoices (inbox_invoices), one per email thread;
 *  - the team's hand-written entries on hello@'s own calendar.
 * A calendar entry on the invoice's day that names the customer (first or
 * last name, 3+ letters, whole word; best match first) is the same function:
 * the invoice item stays and says onCalendar true. If a day has exactly one
 * unmatched invoice and one unclaimed calendar entry, they are the same too
 * when something ties them ("EMMA EVOKE FUNCTION" is Gemma's invoice: EMMA
 * is inside Gemma) and nothing is against it (TBC hold, other space, other
 * numbers). Otherwise both stay: shown twice beats hidden.
 * Everything else on the calendar comes through as its own item.
 */

import { isTeamBooking, toFunctionEvent, type RawCalendarEvent } from "@/lib/functions/calendar"

export type FeedVenue = "BEACH_HOUSE" | "TEA_GARDEN" | "BURLEIGH"
export type FeedStatus = "booked" | "deposit_paid" | "paid" | "tbc" | "new" | "seen" | "ready"

export interface FeedItem {
  /** "fn:<TARTE invoice number>" | "cal:<google event id>" | "cake:<CakeOrder.id>" */
  id: string
  kind: "function" | "cake"
  venue: FeedVenue
  /** Brisbane day, YYYY-MM-DD */
  date: string
  /** Display text: "12:00pm - 2:00pm", "1:30pm" */
  time: string | null
  /** Minutes after midnight Brisbane, when known. */
  startMinutes: number | null
  title: string
  guests: number | null
  space: string | null
  status: FeedStatus
  notes: string | null
  source: "invoice" | "calendar" | "cake_order"
  /** Invoice functions: was a matching hello@ calendar entry found. Calendar items true, cakes null. */
  onCalendar: boolean | null
}

/** One inbox_invoices row as the route reads it. */
export interface InvoiceRowIn {
  id: number
  invoiceNumber: string
  kind: string
  threadId: string
  customerName: string | null
  amount: number
  editable: Record<string, unknown> | null
  /** Latest inbox_bookings.state for the thread ("cancelled" when the cancel label was applied). */
  bookingState: string | null
}

export interface CakeRowIn {
  id: string
  venue: string
  /** YYYY-MM-DD */
  pickupDate: string | null
  /** "13:00" */
  pickupTime: string | null
  customerName: string
  product: string
  quantity: number
  details: string | null
  message: string | null
  dietary: string | null
  status: string
}

export interface FeedRange {
  from: string
  to: string
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

export function inRange(day: string | null | undefined, r: FeedRange): day is string {
  return !!day && DAY_RE.test(day) && day >= r.from && day <= r.to
}

/** Brisbane day (no daylight saving), offset in days. */
export function brisbaneToday(now = new Date(), offset = 0): string {
  return new Date(now.getTime() + 10 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10)
}

export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

export function daySpan(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** A real calendar day, or null. */
export function validDay(v: string | null | undefined): string | null {
  if (!v || !DAY_RE.test(v)) return null
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v
}

/** 720 to "12:00pm", 810 to "1:30pm". */
export function clockText(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`
}

/** First time in a label: "12:00pm - 2:00pm" 720, "11:30am" 690, "3pm onwards" 900, "13:00" 780. */
export function startMinutesOf(label: string | null | undefined): number | null {
  if (!label) return null
  const ap = label.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/i)
  // "11-2pm", "2 to 5pm": the first hour has no am/pm of its own.
  const range = label.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|to|\u2013)\s*(\d{1,2})(?:[:.]\d{2})?\s*(am|pm)\b/i)
  if (range && ap && (range.index ?? 0) <= (ap.index ?? 0)) {
    let h = Number(range[1])
    const m = range[2] ? Number(range[2]) : 0
    const end = Number(range[3])
    if (h < 1 || h > 12 || m > 59) return null
    const endPm = range[4].toLowerCase() === "pm"
    // Same half of the day as the end unless that would put the start after it ("11-2pm" is 11am).
    const pm = endPm && h !== 12 && end !== 12 && h <= end
    if (pm) h += 12
    else if (h === 12 && !endPm) h = 0
    return h * 60 + m
  }
  if (ap) {
    let h = Number(ap[1])
    const m = ap[2] ? Number(ap[2]) : 0
    if (h < 1 || h > 12 || m > 59) return null
    if (ap[3].toLowerCase() === "pm" && h < 12) h += 12
    if (ap[3].toLowerCase() === "am" && h === 12) h = 0
    return h * 60 + m
  }
  const h24 = label.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
  return h24 ? Number(h24[1]) * 60 + Number(h24[2]) : null
}

/** Minutes after midnight Brisbane for an ISO date-time. */
function brisbaneMinutes(iso: string): number | null {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return null
  return Math.floor(((t / 60_000 + 600) % 1440 + 1440) % 1440)
}

/** "The Hideout" / "Tea Garden" from free text, or null. */
export function spaceOf(text: string | null | undefined): string | null {
  if (!text) return null
  if (/hideout/i.test(text)) return "The Hideout"
  if (/\b(tea garden|tg)\b/i.test(text)) return "Tea Garden"
  return null
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null)
/** Display text without long dashes (house rule): an en or em dash between words reads as a comma. */
const plain = (t: string): string => t.replace(/\s*[\u2013\u2014]\s*/g, ", ").replace(/\s+/g, " ").trim()
const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

/** Name words worth matching on a calendar title: 3+ letters. */
export function nameWords(name: string | null | undefined): string[] {
  return [...new Set((name ?? "").toLowerCase().split(/[^a-zÀ-ɏ]+/).filter((w) => w.length >= 3))]
}

function titleWords(title: string): string[] {
  return title.toLowerCase().split(/[^a-z\u00c0-\u024f]+/).filter(Boolean)
}

/**
 * How strongly a calendar title names the customer: each name word found as
 * a whole word scores 1, the last name a little more (the team often writes
 * "Nadeen hideout lunch", sometimes only a surname). 0 is no match.
 */
export function nameScore(title: string, words: string[]): number {
  const t = new Set(titleWords(title))
  return words.reduce((n, w, i) => n + (t.has(w) ? (i === words.length - 1 && words.length > 1 ? 1.5 : 1) : 0), 0)
}

/**
 * A loose link for the one-each-side pairing: a title word of 4+ letters
 * inside a name word or the other way round ("EMMA" in "Gemma").
 */
export function looseNameLink(title: string, words: string[]): boolean {
  const t = titleWords(title).filter((w) => w.length >= 4)
  return words.some((n) => n.length >= 4 && t.some((w) => n.includes(w) || w.includes(n)))
}

const RANK: Record<"booked" | "deposit_paid" | "paid", number> = { booked: 0, deposit_paid: 1, paid: 2 }

interface InvoiceFn {
  item: FeedItem
  words: string[]
  /** Every invoice number on the thread (an entry quoting one is certainly this function). */
  numbers: string[]
  space: string | null
  /** Standard invoice id, for "latest thread wins" between duplicates. */
  rank: number
}

/**
 * One function per email thread: the standard invoice (latest one if the
 * thread has several), or the latest row when there is no standard. Only
 * confirmed bookings, never a cancelled one. amount_paid is often missing
 * when the deposit went straight into Xero, so nothing is ever "unpaid":
 * booked is the neutral word.
 */
export function functionsFromInvoices(rows: InvoiceRowIn[], range: FeedRange): InvoiceFn[] {
  const threads = new Map<string, InvoiceRowIn[]>()
  for (const r of rows) {
    if (!r.threadId || r.invoiceNumber === "PENDING") continue
    threads.set(r.threadId, [...(threads.get(r.threadId) ?? []), r])
  }
  const out: InvoiceFn[] = []
  for (const list of threads.values()) {
    list.sort((a, b) => b.id - a.id)
    const main = list.find((r) => r.kind === "standard") ?? list[0]
    const ed = main.editable ?? {}
    if (ed.customer_confirmed !== true) continue
    if (list.some((r) => r.bookingState === "cancelled")) continue
    const date = validDay(str(ed.event_date))
    if (!inRange(date, range)) continue

    const paid = Math.max(0, ...list.map((r) => num(r.editable?.amount_paid) ?? 0))
    const amount = Math.max(main.amount, ...list.map((r) => r.amount))
    const saveTheDate = (num(ed.flat_deposit_amount) ?? 0) > 0 && !((num(ed.per_person_price) ?? 0) > 0 && (num(ed.guests) ?? 0) > 0)
    let status: "booked" | "deposit_paid" | "paid" = paid > 0 && paid >= amount - 0.005 ? "paid" : paid > 0 ? "deposit_paid" : "booked"
    // A save-the-date invoice paid in full is still only the deposit.
    if (status === "paid" && saveTheDate) status = "deposit_paid"
    // The booking says a deposit landed even when amount_paid was never typed.
    if (status === "booked" && ["deposit_paid", "balance_invoiced", "paid"].includes(main.bookingState ?? "")) status = "deposit_paid"

    const name = str(ed.customer_name) ?? str(main.customerName) ?? "Function"
    const space = str(ed.venue_space)
    const pkg = str(ed.package_name) ?? str(ed.event_type) ?? "Function"
    const what = space && !pkg.toLowerCase().includes(space.toLowerCase().replace(/^the\s+/, "")) ? `${pkg} in ${space}` : pkg
    const timeLabel = str(ed.time_label)
    const diet = str(ed.dietaries)
    out.push({
      item: {
        id: `fn:${main.invoiceNumber}`,
        kind: "function",
        venue: /tea garden/i.test(space ?? "") ? "TEA_GARDEN" : "BEACH_HOUSE",
        date,
        time: timeLabel,
        startMinutes: startMinutesOf(timeLabel),
        title: plain(`${name}, ${what}`),
        guests: num(ed.guests),
        space,
        status,
        notes: diet ? `Dietaries: ${diet}` : null,
        source: "invoice",
        onCalendar: false,
      },
      words: nameWords(name),
      numbers: list.map((r) => r.invoiceNumber),
      space: spaceOf(space),
      rank: list.filter((r) => r.kind === "standard")[0]?.id ?? main.id,
    })
  }
  // The same customer on the same day across two threads (a save-the-date
  // thread and the live one): one function, the latest thread's details.
  const byKey = new Map<string, InvoiceFn>()
  for (const f of out.sort((a, b) => b.rank - a.rank)) {
    const key = `${f.item.date}|${f.item.title.split(",")[0].toLowerCase().trim()}`
    const kept = byKey.get(key)
    if (!kept) byKey.set(key, f)
    else if (RANK[f.item.status as keyof typeof RANK] > RANK[kept.item.status as keyof typeof RANK]) kept.item.status = f.item.status
  }
  return [...byKey.values()]
}

interface CalEntry {
  item: FeedItem
  title: string
  /** Title and description, for invoice numbers the inbox's calendar guard writes in. */
  text: string
  tbc: boolean
  space: string | null
}

/** The team's calendar entries in range, as feed items (TBC holds marked). */
export function calendarEntries(events: RawCalendarEvent[], range: FeedRange): CalEntry[] {
  const out: CalEntry[] = []
  for (const e of events) {
    if (!isTeamBooking(e)) continue
    const fe = toFunctionEvent(e)
    if (!fe || !inRange(fe.day, range)) continue
    const raw = `${e.summary ?? ""}`
    const desc = (e.description ?? "").replace(/\s+/g, " ").trim()
    const both = `${raw} ${desc}`
    const tbc = fe.tbc || /\bsave\s*(?:the\s*)?date\b/i.test(raw)
    const start = e.start?.dateTime ? brisbaneMinutes(e.start.dateTime) : null
    const end = e.end?.dateTime ? brisbaneMinutes(e.end.dateTime) : null
    const space = spaceOf(raw)
    let status: FeedStatus = "booked"
    if (tbc) status = "tbc"
    else if (/\b(?:paid in full|fully paid|balance (?:paid|rec\w*d))\b/i.test(both)) status = "paid"
    else if (/\bdeposit\b(?:\s+invoice)?\s+(?:paid|rec\w*d)\b/i.test(both)) status = "deposit_paid"
    out.push({
      item: {
        id: `cal:${e.id ?? `${fe.day}:${raw.trim()}`}`,
        kind: "function",
        venue: space === "Tea Garden" ? "TEA_GARDEN" : /burleigh/i.test(raw) ? "BURLEIGH" : "BEACH_HOUSE",
        date: fe.day,
        time: start === null ? null : end !== null && end > start ? `${clockText(start)} - ${clockText(end)}` : clockText(start),
        startMinutes: start,
        title: plain(fe.title),
        guests: fe.pax,
        space,
        status,
        notes: desc && !/g\.co\/calendar/i.test(desc) ? desc.slice(0, 300) : null,
        source: "calendar",
        onCalendar: true,
      },
      title: fe.title,
      text: both,
      tbc,
      space,
    })
  }
  return out
}

/** Invoices first, each claims the calendar entry that names its customer; the rest of the calendar stays. */
export function mergeFunctions(invoices: InvoiceFn[], calendar: CalEntry[], calendarOk = true): FeedItem[] {
  const claimed = new Set<CalEntry>()
  const matched = new Set<InvoiceFn>()
  const claim = (f: InvoiceFn, c: CalEntry) => {
    claimed.add(c)
    matched.add(f)
    f.item.onCalendar = true
    // The calendar often has the time or numbers the invoice lacks.
    if (f.item.startMinutes === null && c.item.startMinutes !== null) {
      f.item.time = c.item.time
      f.item.startMinutes = c.item.startMinutes
    }
    if (f.item.guests === null && c.item.guests !== null) f.item.guests = c.item.guests
  }

  const sorted = [...invoices].sort((a, b) => a.item.date.localeCompare(b.item.date) || (a.item.startMinutes ?? -1) - (b.item.startMinutes ?? -1))
  // Best name matches first, so "Emma Jones" takes "Emma Jones TG" and leaves "Emma W" alone.
  const pairs: { f: InvoiceFn; c: CalEntry; score: number }[] = []
  for (const f of sorted) {
    for (const c of calendar) {
      if (c.item.date !== f.item.date) continue
      const quoted = f.numbers.some((n) => c.text.includes(n))
      const score = (quoted ? 10 : 0) + nameScore(c.title, f.words)
      if (score <= 0) continue
      // One name word alone ("Emma") is not enough against a different space or head count.
      if (!quoted && score < 2) {
        if (f.space && c.space && f.space !== c.space) continue
        if (f.item.guests !== null && c.item.guests !== null && f.item.guests !== c.item.guests) continue
      }
      pairs.push({ f, c, score })
    }
  }
  pairs.sort((a, b) => b.score - a.score)
  for (const { f, c } of pairs) if (!matched.has(f) && !claimed.has(c)) claim(f, c)

  // One left on each side on a day: the same function written differently,
  // but only with something tying them together (a name inside a name, the
  // same numbers or the same start) and nothing against it. Otherwise both
  // stay: a function shown twice is better than one hidden.
  for (const day of new Set(sorted.map((f) => f.item.date))) {
    const fs = sorted.filter((f) => f.item.date === day && !matched.has(f))
    const cs = calendar.filter((c) => c.item.date === day && !claimed.has(c))
    if (fs.length !== 1 || cs.length !== 1) continue
    const [f, c] = [fs[0], cs[0]]
    if (c.tbc) continue
    if (f.space && c.space && f.space !== c.space) continue
    const sameGuests = f.item.guests !== null && c.item.guests !== null && f.item.guests === c.item.guests
    const sameStart = f.item.startMinutes !== null && c.item.startMinutes !== null && f.item.startMinutes === c.item.startMinutes
    if (!looseNameLink(c.title, f.words) && !sameGuests && !sameStart) continue
    if (f.item.guests !== null && c.item.guests !== null && !sameGuests) continue
    claim(f, c)
  }

  const items = invoices.map((f) => {
    if (!calendarOk) f.item.onCalendar = null
    return f.item
  })
  for (const c of calendar) if (!claimed.has(c)) items.push(c.item)
  return items
}

const CAKE_STATUS: Record<string, FeedStatus | undefined> = { NEW: "new", SEEN: "seen", READY: "ready" }

/** Cake pickups in range that are still to happen (not collected, not cancelled). */
export function cakeItems(rows: CakeRowIn[], range: FeedRange): FeedItem[] {
  const out: FeedItem[] = []
  for (const c of rows) {
    const status = CAKE_STATUS[c.status]
    if (!status || !inRange(c.pickupDate, range)) continue
    const start = startMinutesOf(c.pickupTime)
    // BOTH never comes from the cake page; read it as Burleigh, the same as the page does.
    const venue: FeedVenue = c.venue === "BEACH_HOUSE" || c.venue === "TEA_GARDEN" ? c.venue : "BURLEIGH"
    const notes = [
      c.details,
      c.message ? `On the cake: "${c.message}"` : null,
      c.dietary ? `Dietary: ${c.dietary}` : null,
    ].filter(Boolean)
    out.push({
      id: `cake:${c.id}`,
      kind: "cake",
      venue,
      date: c.pickupDate,
      time: start === null ? null : clockText(start),
      startMinutes: start,
      title: plain(`Cake pickup: ${c.customerName}, ${Math.max(1, c.quantity)}x ${c.product}`),
      guests: null,
      space: null,
      status,
      notes: notes.length ? notes.join(". ") : null,
      source: "cake_order",
      onCalendar: null,
    })
  }
  return out
}

/** Day, then time (no time first, like an all-day entry), functions before cakes. */
export function sortFeed(items: FeedItem[]): FeedItem[] {
  return [...items].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.startMinutes ?? -1) - (b.startMinutes ?? -1) ||
      (a.kind === b.kind ? 0 : a.kind === "function" ? -1 : 1) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
  )
}

export function buildFeed(input: {
  range: FeedRange
  invoices: InvoiceRowIn[]
  calendar: RawCalendarEvent[] | null
  cakes: CakeRowIn[]
}): FeedItem[] {
  const fns = mergeFunctions(
    functionsFromInvoices(input.invoices, input.range),
    calendarEntries(input.calendar ?? [], input.range),
    input.calendar !== null
  )
  return sortFeed([...fns, ...cakeItems(input.cakes, input.range)])
}
