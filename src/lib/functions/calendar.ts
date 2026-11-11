import { getHelloAccessToken } from "@/lib/gmail/hello-token"

/**
 * Upcoming functions, read-only from two Google calendars:
 * 1. hello@'s own calendar, where the team writes every function, enquiry
 *    hold and deposit note by hand. This is the real functions diary.
 * 2. "Tarte Bookings (auto)", which Tarte Inbox fills hourly from Now Book It
 *    with high-tea groups.
 * Until 11 Nov 2026 the page read only the second one, so none of the team's
 * functions showed here and a function was double booked.
 */
export const FUNCTIONS_CALENDAR_NAME = "Tarte Bookings (auto)"

/** hello@'s main calendar: the one the team keeps functions on. */
export const TEAM_CALENDAR_ID = "primary"

/** Now Book It high teas smaller than this are ordinary seating, not a function. */
export const MIN_HIGH_TEA_GROUP = 10

/** Georgia's functions app (run sheets, orders, dietaries, invoices). */
export const FUNCTIONS_APP_URL = "https://tarte-functions-app.expo.app/"

export interface RawCalendarEvent {
  id?: string
  status?: string
  summary?: string
  eventType?: string
  organizer?: { email?: string; self?: boolean }
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

export interface FunctionEvent {
  id: string
  /** Brisbane calendar day, YYYY-MM-DD. */
  day: string
  /** "10:30 am" style, or null for an all-day entry. */
  time: string | null
  endTime: string | null
  title: string
  /** Held but not locked in (unconfirmed, or deposit not yet paid). */
  tbc: boolean
  pax: number | null
}

export interface FunctionDay {
  day: string
  events: FunctionEvent[]
  /** Spaces with two or more team entries this day, e.g. ["Hideout"]. */
  clashes: string[]
}

/**
 * True for entries on hello@'s calendar that are bookings. Drops paddle board
 * and kayak hire (Acuity), Gmail's own "Reservation at ..." cards, meeting
 * invites from outside Tarte, and entries the team has marked cancelled.
 */
export function isTeamBooking(e: RawCalendarEvent): boolean {
  if (e.eventType === "fromGmail") return false
  const org = e.organizer?.email?.toLowerCase()
  if (org && !org.endsWith("@tarte.com.au")) return false
  const s = e.summary ?? ""
  if (/paddle\s*board\s*hire|kayak\s*hire|paddle\s*hire/i.test(s)) return false
  if (/^\s*cancell?ed\b/i.test(s)) return false
  return true
}

/** Auto-calendar entries worth showing: high-tea groups, not tables of two. */
export function isGroupBooking(e: FunctionEvent): boolean {
  return e.pax === null || e.pax >= MIN_HIGH_TEA_GROUP
}

const SPACES: { name: string; re: RegExp }[] = [
  { name: "Hideout", re: /hideout/i },
  { name: "Tea Garden", re: /\b(tea garden|tg)\b/i },
]

/** Spaces named by two or more of the team's entries on one day. */
export function clashesFor(titles: string[]): string[] {
  return SPACES.filter((sp) => titles.filter((t) => sp.re.test(t)).length >= 2).map((sp) => sp.name)
}

const BRISBANE = "Australia/Brisbane"

function brisbaneDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BRISBANE }).format(new Date(iso))
}

function brisbaneTime(iso: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(iso))
}

/** One calendar entry as the page shows it; null for cancelled or empty ones. */
export function toFunctionEvent(e: RawCalendarEvent): FunctionEvent | null {
  if (e.status === "cancelled") return null
  const raw = (e.summary ?? "").trim()
  if (!raw) return null
  const startIso = e.start?.dateTime
  const day = startIso ? brisbaneDay(startIso) : e.start?.date
  if (!day) return null
  // The team writes holds as "TBC - Pennie ...", "Chloe L TBC 40pax ...", "... Jade Finch TBC" or "ENQUIRY - ...".
  const tbc = /\bTBC\b/i.test(raw) || /\benquiry\b/i.test(raw)
  const title = raw.replace(/^TBC\s*[-–—:]*\s*/i, "").replace(/\s*\bTBC\s*$/i, "").trim()
  // "(17 pax)" from the sync, or "17 pax", "40pax", "15-20pax" typed by hand (top of a range).
  const pax = title.match(/\((\d+)\s*pax\)/i) ?? title.match(/\b(?:\d+\s*-\s*)?(\d+)\s*pax\b/i)
  return {
    id: e.id ?? `${day}:${raw}`,
    day,
    time: startIso ? brisbaneTime(startIso) : null,
    endTime: e.end?.dateTime ? brisbaneTime(e.end.dateTime) : null,
    // Now Book It prefixes every service "Currumbin || "; all of these are Currumbin.
    title: title.replace(/\s*\(\d+\s*pax\)/i, "").replace(/^Currumbin\s*\|\|\s*/i, ""),
    tbc,
    pax: pax ? Number(pax[1]) : null,
  }
}

/** Events grouped by Brisbane day, days in order, timed entries in order. */
export function groupByDay(events: RawCalendarEvent[], teamIds: Set<string> = new Set()): FunctionDay[] {
  const withSort = events
    .map((e) => ({ ev: toFunctionEvent(e), at: e.start?.dateTime ?? e.start?.date ?? "" }))
    .filter((x): x is { ev: FunctionEvent; at: string } => x.ev !== null)
    .sort((a, b) => a.ev.day.localeCompare(b.ev.day) || new Date(a.at).getTime() - new Date(b.at).getTime())
  const days: FunctionDay[] = []
  for (const { ev } of withSort) {
    const last = days[days.length - 1]
    if (last && last.day === ev.day) last.events.push(ev)
    else days.push({ day: ev.day, events: [ev], clashes: [] })
  }
  for (const d of days) d.clashes = clashesFor(d.events.filter((e) => teamIds.has(e.id)).map((e) => e.title))
  return days
}

export type FunctionsCalendarResult =
  | { ok: true; days: FunctionDay[] }
  | { ok: false; reason: string }

/** The next `daysAhead` days of functions, from today in Brisbane. */
export async function getUpcomingFunctions(daysAhead = 90): Promise<FunctionsCalendarResult> {
  const token = await getHelloAccessToken("functions-calendar")
  if (!token) return { ok: false, reason: "The hello@ Google connection is not available right now." }
  const headers = { Authorization: `Bearer ${token}` }

  const today = brisbaneDay(new Date().toISOString())
  const timeMin = new Date(`${today}T00:00:00+10:00`)
  const timeMax = new Date(timeMin.getTime() + daysAhead * 86_400_000)
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "500",
  })
  const eventsOf = async (calendarId: string): Promise<RawCalendarEvent[] | null> => {
    const r = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers, cache: "no-store" }
    )
    if (!r.ok) return null
    return ((await r.json()) as { items?: RawCalendarEvent[] }).items ?? []
  }

  const autoId = async (): Promise<string | null> => {
    const r = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250", {
      headers,
      cache: "no-store",
    })
    if (!r.ok) return null
    const list = (await r.json()) as { items?: { id: string; summary?: string }[] }
    return (list.items ?? []).find((c) => c.summary === FUNCTIONS_CALENDAR_NAME)?.id ?? null
  }

  const [team, auto] = await Promise.all([
    eventsOf(TEAM_CALENDAR_ID),
    autoId().then((id) => (id ? eventsOf(id) : null)),
  ])
  if (team === null && auto === null) return { ok: false, reason: "Google Calendar did not answer." }

  const teamEvents = (team ?? []).filter(isTeamBooking)
  const autoEvents = (auto ?? []).filter((e) => {
    const ev = toFunctionEvent(e)
    return ev !== null && isGroupBooking(ev)
  })
  const teamIds = new Set(
    teamEvents.map((e) => toFunctionEvent(e)?.id).filter((id): id is string => Boolean(id))
  )
  return { ok: true, days: groupByDay([...teamEvents, ...autoEvents], teamIds) }
}
