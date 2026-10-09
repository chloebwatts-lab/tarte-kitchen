import { shiftsBase } from "@/lib/shifts-staff"
import type { Venue } from "@/generated/prisma/client"

/**
 * Tarte Shifts labour feed: the replacement for Deputy's Roster + Timesheet
 * resources once Deputy is cancelled. Kitchen keeps its own LabourShift
 * table (labour dashboard, live tracker, line-up, GM desk, Friday digest
 * recode, sides challenge all read it); this module turns one feed response
 * into the same rows the Deputy sync wrote, so nothing downstream changes.
 *
 *   GET {SHIFTS_BASE}/api/internal/labour?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Authorization: Bearer <SHIFTS_SECRET>   (Shifts' CRON_SECRET, like the
 *   verify-staff / staff-list / payruns routes)
 *
 * The contract Kitchen expects is `ShiftsLabourFeed` below; docs/shifts-
 * labour-feed.md spells it out for the Shifts side. Everything except
 * `shifts` and `timesheets` is optional so a first version of the endpoint
 * can ship small.
 */

export type ShiftsVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
export type ShiftsBucket = "CHEFS_KP" | "FOH_BARISTA" | "PASTRY" | "OTHER"

export interface FeedShift {
  id: string
  venue: ShiftsVenue
  /** Area name as rostered ("Kitchen", "Cafe FOH", ...). Same names Deputy used. */
  area: string | null
  /** Null for an open (unfilled) shift. */
  employeeId: string | null
  /** "First Last"; null for an open shift. */
  employeeName: string | null
  /** ISO instants (UTC). */
  start: string
  end: string
  breakMin?: number
  /** Paid hours (break removed). */
  hours: number
  /** Gross $ ex super. 0 for open shifts and for salaried staff (their
   * weekly $ arrive in `salaries`). Weekend / public-holiday rates included. */
  cost: number
  isOpen: boolean
  published: boolean
}

export interface FeedTimesheet {
  id: string
  venue: ShiftsVenue
  area: string | null
  employeeId: string
  employeeName: string
  clockIn: string
  /** Null while the person is still clocked on. */
  clockOut: string | null
  breakMin?: number
  /** Paid hours so far (live when clockOut is null). */
  hours: number
  /** Gross $ ex super, 0 for salaried staff. */
  cost: number
  approved: boolean
}

export interface FeedSalary {
  venue: ShiftsVenue
  /** The team the salary belongs to. Names are never sent, only the roll-up. */
  bucket: ShiftsBucket
  /** Sum of weekly gross (ex super) for active salaried staff counted in
   * wage %, i.e. includeInWagePct = true, not sandbox. */
  weeklyGross: number
  headcount: number
}

export interface FeedForecast {
  venue: ShiftsVenue
  /** YYYY-MM-DD, the Wednesday that starts the trading week. */
  weekStartWed: string
  /** Ex GST. */
  amount: number
  source: "manager" | "lastYear"
}

export interface ShiftsLabourFeed {
  ok: true
  from: string
  to: string
  shifts: FeedShift[]
  timesheets: FeedTimesheet[]
  salaries?: FeedSalary[]
  forecasts?: FeedForecast[]
}

export class ShiftsFeedError extends Error {
  constructor(
    message: string,
    /** HTTP status when the feed answered, 0 for network / config problems. */
    readonly status: number
  ) {
    super(message)
    this.name = "ShiftsFeedError"
  }
  /** True when Tarte Shifts does not (yet) serve this route. */
  get missingEndpoint(): boolean {
    return this.status === 404
  }
}

/** YYYY-MM-DD of the AEST calendar day for an instant. */
export function aestDateIso(d: Date): string {
  return new Date(d.getTime() + 10 * 3600_000).toISOString().slice(0, 10)
}

export async function fetchShiftsLabour(from: Date, to: Date): Promise<ShiftsLabourFeed> {
  const base = shiftsBase()
  const secret = process.env.SHIFTS_SECRET
  if (!base || !secret) {
    throw new ShiftsFeedError("Tarte Shifts feed is not configured (SHIFTS_PAYRUNS_URL / SHIFTS_SECRET)", 0)
  }
  const url = new URL(`${base}/api/internal/labour`)
  url.searchParams.set("from", aestDateIso(from))
  url.searchParams.set("to", aestDateIso(to))
  let res: Response
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${secret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(60_000),
    })
  } catch (e) {
    throw new ShiftsFeedError(`Tarte Shifts feed unreachable: ${(e as Error).message}`, 0)
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new ShiftsFeedError(`Tarte Shifts feed ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`, res.status)
  }
  const body = (await res.json()) as Partial<ShiftsLabourFeed> & { ok?: boolean; error?: string }
  if (!body.ok || !Array.isArray(body.shifts) || !Array.isArray(body.timesheets)) {
    throw new ShiftsFeedError(`Tarte Shifts feed: ${body.error ?? "malformed response"}`, res.status)
  }
  return body as ShiftsLabourFeed
}

// ---------------------------------------------------------------------
// Pure mapping: feed -> LabourShift rows (same shape the Deputy sync wrote)
// ---------------------------------------------------------------------

export interface LabourRowInput {
  deputyId: string
  employeeName: string
  employeeId: string | null
  venue: Venue
  shiftStart: Date
  shiftEnd: Date
  hours: number
  cost: number
  payRate: number | null
  area: string | null
  approved: boolean
  isOpen: boolean
  source: "ROSTER" | "TIMESHEET"
  published: boolean | null
}

export const SHIFTS_ID_PREFIX = "shifts-"

/**
 * Deputy priced salaried staff through per-venue "Salary X" placeholder
 * employees rostered under areas of the same name. Every Kitchen reader
 * knows those names (buckets, the live tracker's fixed-cost rule, the
 * line-up and GM desk filters), so Tarte Shifts' salary roll-up is written
 * back under the very same area names. Tea Garden never had one; its name
 * follows the pattern and is mapped in buckets.ts.
 */
export const SALARY_PLACEHOLDER_AREA: Record<ShiftsVenue, Record<ShiftsBucket, string>> = {
  BURLEIGH: {
    CHEFS_KP: "Salary BOH BURLEIGH",
    FOH_BARISTA: "Salary FOH BURLEIGH",
    PASTRY: "Salary PASTRY BURLEIGH",
    OTHER: "Salary OTHER BURLEIGH",
  },
  BEACH_HOUSE: {
    CHEFS_KP: "Salary Chef Currumbin",
    FOH_BARISTA: "Salary Currumbin FOH",
    PASTRY: "Salary Pastry Currumbin",
    OTHER: "Salary Other Currumbin",
  },
  TEA_GARDEN: {
    CHEFS_KP: "Salary TG Kitchen",
    FOH_BARISTA: "Salary TG FOH",
    PASTRY: "Salary TG Pastry",
    OTHER: "Salary TG Other",
  },
}

const VENUES: ReadonlySet<string> = new Set(["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"])
const BUCKETS: ReadonlySet<string> = new Set(["CHEFS_KP", "FOH_BARISTA", "PASTRY", "OTHER"])

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}
const round2 = (n: number) => Math.round(n * 100) / 100
const instant = (s: unknown): Date | null => {
  const d = new Date(String(s))
  return Number.isFinite(d.getTime()) ? d : null
}

/** Wednesday 00:00 AEST (as a UTC instant) that starts the week holding `d`. */
export function tarteWeekStartInstant(d: Date): Date {
  const aest = new Date(d.getTime() + 10 * 3600_000)
  // getUTCDay on the shifted date is the AEST weekday; Wed = 3.
  const back = (aest.getUTCDay() - 3 + 7) % 7
  const wedAestMidnight = Date.UTC(aest.getUTCFullYear(), aest.getUTCMonth(), aest.getUTCDate() - back)
  return new Date(wedAestMidnight - 10 * 3600_000)
}

export interface MappedFeed {
  roster: LabourRowInput[]
  timesheets: LabourRowInput[]
  /** Rows the feed sent that Kitchen could not place (bad venue / dates). */
  skipped: number
  forecasts: Array<{ venue: Venue; weekStartWed: Date; amount: number }>
}

/**
 * Turn a feed response into LabourShift rows.
 *
 *   rosterWeeks  the Wednesday instants of every trading week in the roster
 *                window; one salary placeholder row per venue + bucket is
 *                written at each, dated Wed 00:00 AEST, so the live tracker
 *                and labour dashboard count the fixed weekly cost exactly as
 *                they did with Deputy's cards.
 *   now          for live timesheets (no clockOut): their end is "now".
 */
export function labourRowsFromFeed(feed: ShiftsLabourFeed, rosterWeeks: Date[], now = new Date()): MappedFeed {
  const roster: LabourRowInput[] = []
  const timesheets: LabourRowInput[] = []
  let skipped = 0

  for (const s of feed.shifts) {
    const start = instant(s.start)
    const end = instant(s.end)
    if (!VENUES.has(s.venue) || !start || !end) {
      skipped++
      continue
    }
    const isOpen = s.isOpen === true || !s.employeeId
    const hours = num(s.hours) > 0 ? num(s.hours) : Math.max(0, (end.getTime() - start.getTime()) / 3600_000 - num(s.breakMin) / 60)
    const cost = isOpen ? 0 : Math.max(0, num(s.cost))
    roster.push({
      deputyId: `${SHIFTS_ID_PREFIX}roster-${s.id}`,
      employeeName: isOpen ? "Open shift" : (s.employeeName ?? "").trim() || `Employee ${s.employeeId}`,
      employeeId: isOpen ? null : s.employeeId,
      venue: s.venue as Venue,
      shiftStart: start,
      shiftEnd: end,
      hours: round2(hours),
      cost: round2(cost),
      payRate: hours > 0 && cost > 0 ? round2(cost / hours) : null,
      area: s.area?.trim() || null,
      approved: false,
      isOpen,
      source: "ROSTER",
      published: s.published === true,
    })
  }

  for (const t of feed.timesheets) {
    const start = instant(t.clockIn)
    if (!VENUES.has(t.venue) || !start) {
      skipped++
      continue
    }
    const end = (t.clockOut ? instant(t.clockOut) : null) ?? now
    const hours = num(t.hours) > 0 ? num(t.hours) : Math.max(0, (end.getTime() - start.getTime()) / 3600_000 - num(t.breakMin) / 60)
    const cost = Math.max(0, num(t.cost))
    timesheets.push({
      deputyId: `${SHIFTS_ID_PREFIX}timesheet-${t.id}`,
      employeeName: (t.employeeName ?? "").trim() || `Employee ${t.employeeId}`,
      employeeId: t.employeeId,
      venue: t.venue as Venue,
      shiftStart: start,
      shiftEnd: end,
      hours: round2(hours),
      cost: round2(cost),
      payRate: hours > 0 && cost > 0 ? round2(cost / hours) : null,
      area: t.area?.trim() || null,
      approved: t.approved === true,
      isOpen: false,
      source: "TIMESHEET",
      published: null,
    })
  }

  // Salary roll-ups: one placeholder row per venue + bucket per roster week.
  const byKey = new Map<string, { venue: ShiftsVenue; bucket: ShiftsBucket; gross: number; heads: number }>()
  for (const s of feed.salaries ?? []) {
    if (!VENUES.has(s.venue) || !BUCKETS.has(s.bucket) || num(s.weeklyGross) <= 0) continue
    const key = `${s.venue}|${s.bucket}`
    const cur = byKey.get(key) ?? { venue: s.venue, bucket: s.bucket, gross: 0, heads: 0 }
    cur.gross += num(s.weeklyGross)
    cur.heads += num(s.headcount)
    byKey.set(key, cur)
  }
  for (const wed of rosterWeeks) {
    const wedIso = aestDateIso(wed)
    for (const { venue, bucket, gross } of byKey.values()) {
      const area = SALARY_PLACEHOLDER_AREA[venue][bucket]
      roster.push({
        deputyId: `${SHIFTS_ID_PREFIX}salary-${venue}-${bucket}-${wedIso}`,
        employeeName: area,
        employeeId: null,
        venue: venue as Venue,
        shiftStart: wed,
        shiftEnd: new Date(wed.getTime() + 3600_000),
        hours: 0,
        cost: round2(gross),
        payRate: null,
        area,
        approved: false,
        isOpen: false,
        source: "ROSTER",
        published: true,
      })
    }
  }

  const forecasts: MappedFeed["forecasts"] = []
  for (const f of feed.forecasts ?? []) {
    if (!VENUES.has(f.venue) || !/^\d{4}-\d{2}-\d{2}$/.test(String(f.weekStartWed)) || num(f.amount) <= 0) continue
    const weekStartWed = new Date(`${f.weekStartWed}T00:00:00.000Z`)
    // ManagerSalesForecast is keyed by the Wednesday; any other weekday
    // would be a row nothing reads.
    if (!Number.isFinite(weekStartWed.getTime()) || weekStartWed.getUTCDay() !== 3) continue
    forecasts.push({ venue: f.venue as Venue, weekStartWed, amount: round2(num(f.amount)) })
  }

  return { roster, timesheets, skipped, forecasts }
}
