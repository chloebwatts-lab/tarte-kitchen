import { getHelloAccessToken } from "@/lib/gmail/hello-token"

/**
 * Upcoming functions and high teas, read from the "Tarte Bookings (auto)"
 * Google calendar that Tarte Inbox keeps in step with the hello@ mailbox and
 * Now Book It every hour. Read-only here: the calendar is the link between
 * the inbox and this page, so nothing is stored twice.
 */
export const FUNCTIONS_CALENDAR_NAME = "Tarte Bookings (auto)"

/** Georgia's functions app (run sheets, orders, dietaries, invoices). */
export const FUNCTIONS_APP_URL = "https://tarte-functions-app.expo.app/"

export interface RawCalendarEvent {
  id?: string
  status?: string
  summary?: string
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
  const tbc = /^TBC\b/i.test(raw)
  const title = raw.replace(/^TBC\s*[-–—:]*\s*/i, "")
  const pax = title.match(/\((\d+)\s*pax\)/i)
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
export function groupByDay(events: RawCalendarEvent[]): FunctionDay[] {
  const withSort = events
    .map((e) => ({ ev: toFunctionEvent(e), at: e.start?.dateTime ?? e.start?.date ?? "" }))
    .filter((x): x is { ev: FunctionEvent; at: string } => x.ev !== null)
    .sort((a, b) => a.ev.day.localeCompare(b.ev.day) || new Date(a.at).getTime() - new Date(b.at).getTime())
  const days: FunctionDay[] = []
  for (const { ev } of withSort) {
    const last = days[days.length - 1]
    if (last && last.day === ev.day) last.events.push(ev)
    else days.push({ day: ev.day, events: [ev] })
  }
  return days
}

export type FunctionsCalendarResult =
  | { ok: true; days: FunctionDay[] }
  | { ok: false; reason: string }

/** The next `daysAhead` days of the functions calendar, from today in Brisbane. */
export async function getUpcomingFunctions(daysAhead = 90): Promise<FunctionsCalendarResult> {
  const token = await getHelloAccessToken("functions-calendar")
  if (!token) return { ok: false, reason: "The hello@ Google connection is not available right now." }
  const headers = { Authorization: `Bearer ${token}` }

  const listRes = await fetch(
    "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250",
    { headers, cache: "no-store" }
  )
  if (!listRes.ok) return { ok: false, reason: `Google Calendar did not answer (${listRes.status}).` }
  const list = (await listRes.json()) as { items?: { id: string; summary?: string }[] }
  const cal = (list.items ?? []).find((c) => c.summary === FUNCTIONS_CALENDAR_NAME)
  if (!cal) return { ok: false, reason: `The "${FUNCTIONS_CALENDAR_NAME}" calendar was not found.` }

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
  const evRes = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?${params}`,
    { headers, cache: "no-store" }
  )
  if (!evRes.ok) return { ok: false, reason: `Google Calendar did not answer (${evRes.status}).` }
  const data = (await evRes.json()) as { items?: RawCalendarEvent[] }
  return { ok: true, days: groupByDay(data.items ?? []) }
}
