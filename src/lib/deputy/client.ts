import { db } from "@/lib/db"
import { decrypt, encrypt } from "@/lib/encryption"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"

/**
 * Deputy integration.
 *
 * Deputy exposes two kinds of install:
 *   - Deputy Premium (standard): hosted at {install}.{region}.deputy.com, uses
 *     OAuth2 with a refresh_token.
 *   - Once.com (legacy "My Deputy"): long-lived bearer token only.
 *
 * We store one DeputyConnection row. The OAuth flow lives in
 * /api/deputy/{connect,callback}. This module assumes a valid connection
 * and gives you typed helpers.
 *
 * Spec: https://www.deputy.com/api-doc
 * The endpoints we care about:
 *   GET /api/v1/resource/Roster      — rostered shifts
 *   GET /api/v1/resource/Timesheet   — actual worked + approved timesheets
 *   GET /api/v1/resource/Employee    — names, payrates
 *   GET /api/v1/resource/Company     — operational-unit / location list
 *
 * NOTE: Deputy's search API uses a POST body with `search` filters — not
 * query-strings. That's why `deputyFetch` defaults to JSON POST.
 */

export interface DeputyRosterShift {
  Id: number
  Employee: number
  OperationalUnit: number
  StartTime: number // unix seconds
  EndTime: number
  TotalTime?: number // hours — sometimes on Roster, sometimes computed
  Cost?: number // forecast cost on Roster (pre-approval, from nominal rate)
  /// "The total dollar cost of the shift" — per Deputy's own docs. When
  /// Deputy has super/on-costs configured per-employee, OnCost is the
  /// fully-loaded figure that matches Deputy's Insights Summary display.
  /// Cost is the base unloaded cost. If OnCost > 0 we prefer it and skip
  /// our own super multiplier; otherwise we load Cost ourselves.
  OnCost?: number
  Open?: boolean
}

export interface DeputyTimesheet {
  Id: number
  Employee: number
  // Foreign key to OperationalUnit.Id. Deputy uses `OperationalUnit` on
  // Timesheet rows even though OperationalUnit resource list uses `Id`.
  OperationalUnit: number
  StartTime: number
  EndTime: number
  TotalTime: number // hours
  Cost: number // gross $
  PayRate: number | null
  Approved: boolean
}

export interface DeputyEmployee {
  Id: number
  DisplayName: string
  FirstName?: string
  LastName?: string
  PayRate?: number
}

export interface DeputyOpUnit {
  Id: number
  OperationalUnitName: string
  Company?: number
}

export async function getConnection() {
  const c = await db.deputyConnection.findFirst()
  if (!c) throw new Error("No Deputy connection")
  return c
}

function apiBase(install: string, region: string) {
  return `https://${install}.${region}.deputy.com`
}

async function getValidAccessToken(): Promise<{ token: string; install: string; region: string }> {
  const c = await getConnection()
  // If we have a refresh token and current is expired → refresh
  if (
    c.refreshToken &&
    c.tokenExpiresAt &&
    c.tokenExpiresAt.getTime() <= Date.now() + 60_000
  ) {
    const refreshToken = decrypt(c.refreshToken)
    const params = new URLSearchParams({
      client_id: process.env.DEPUTY_CLIENT_ID ?? "",
      client_secret: process.env.DEPUTY_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "longlife_refresh_token",
    })
    // Install-local refresh endpoint — same host the OAuth authorize
    // flow used. We rebuild from the stored install/region.
    const res = await fetch(
      `https://${c.install}.${c.region}.deputy.com/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }
    )
    if (!res.ok) throw new Error(`Deputy token refresh failed: ${await res.text()}`)
    const data = (await res.json()) as {
      access_token: string
      refresh_token?: string
      expires_in: number
    }
    await db.deputyConnection.update({
      where: { id: c.id },
      data: {
        accessToken: encrypt(data.access_token),
        refreshToken: data.refresh_token
          ? encrypt(data.refresh_token)
          : c.refreshToken,
        tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
      },
    })
    return { token: data.access_token, install: c.install, region: c.region }
  }
  return {
    token: decrypt(c.accessToken),
    install: c.install,
    region: c.region,
  }
}

async function deputyFetch<T>(
  path: string,
  init: { method?: "GET" | "POST"; body?: unknown } = {}
): Promise<T> {
  const { token, install, region } = await getValidAccessToken()
  const url = `${apiBase(install, region)}${path}`
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `OAuth ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    throw new Error(
      `Deputy ${init.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`
    )
  }
  return (await res.json()) as T
}

export async function listOpUnits(): Promise<DeputyOpUnit[]> {
  return deputyFetch<DeputyOpUnit[]>("/api/v1/resource/OperationalUnit")
}

/**
 * Paginate through every Employee row. Deputy's default page size is 500.
 * Tarte has well over that — without paging we'd be missing salaried staff
 * whose names then degrade to "Employee #NNN" placeholders and whose
 * lump-sum Roster cost can't be attributed correctly.
 */
export async function listEmployees(): Promise<DeputyEmployee[]> {
  const PAGE = 500
  const out: DeputyEmployee[] = []
  for (let start = 0; ; start += PAGE) {
    const page = await deputyFetch<DeputyEmployee[]>(
      `/api/v1/resource/Employee?start=${start}`
    )
    if (!Array.isArray(page) || page.length === 0) break
    out.push(...page)
    if (page.length < PAGE) break
    // Safety cap so a misbehaving server can't put us in an infinite loop.
    if (start >= 10000) break
  }
  return out
}

export interface DeputyPlanSales {
  Id: number
  Date: string // "2026-04-22T00:00:00+10:00"
  Timestamp: number
  OperationalUnit: number
  SalesType: string // "plan_Sales" for manager forecasts
  SalesAmount: number
}

/**
 * Manager sales forecast per day per operational unit. Deputy's own
 * Roster Insights Summary uses these values as the labour-%% denominator.
 * SalesType=plan_Sales is the manager's planned forecast; other types
 * (actual_Sales, etc) are left alone.
 */
export async function listPlanSalesBetween(
  sinceUnix: number,
  untilUnix: number
): Promise<DeputyPlanSales[]> {
  return deputyFetch<DeputyPlanSales[]>(
    "/api/v1/resource/SalesData/QUERY",
    {
      method: "POST",
      body: {
        search: {
          s1: { field: "Timestamp", type: "ge", data: sinceUnix },
          s2: { field: "Timestamp", type: "lt", data: untilUnix },
          s3: { field: "SalesType", type: "eq", data: "plan_Sales" },
        },
        max: 2000,
        sort: { Timestamp: "asc" },
      },
    }
  )
}

/**
 * Rostered/scheduled shifts between two unix timestamps. This is what
 * Deputy's own Insights Summary pulls from — forecast hours and forecast
 * wages for the current and upcoming week.
 */
export async function listRosterBetween(
  sinceUnix: number,
  untilUnix: number
): Promise<DeputyRosterShift[]> {
  return deputyFetch<DeputyRosterShift[]>(
    "/api/v1/resource/Roster/QUERY",
    {
      method: "POST",
      body: {
        search: {
          s1: { field: "StartTime", type: "ge", data: sinceUnix },
          s2: { field: "StartTime", type: "lt", data: untilUnix },
        },
        max: 2000,
        sort: { StartTime: "asc" },
      },
    }
  )
}

export async function listTimesheetsSince(
  sinceUnix: number
): Promise<DeputyTimesheet[]> {
  // Deputy's /QUERY search shape: { search: { <alias>: { field, type, data } } }
  // where `type` ∈ eq|ne|gt|ge|lt|le|like|in and `data` is the raw value
  // (integer for timestamp fields). Using `stringValue` returned 400.
  return deputyFetch<DeputyTimesheet[]>(
    "/api/v1/resource/Timesheet/QUERY",
    {
      method: "POST",
      body: {
        search: {
          s1: { field: "StartTime", type: "ge", data: sinceUnix },
        },
        max: 500,
        sort: { StartTime: "asc" },
      },
    }
  )
}

/**
 * Pull Deputy rosters for the live window (current + next Wed–Tue week)
 * and upsert them into LabourShift with source=ROSTER. These drive the
 * forward-looking labour % on /labour.
 *
 * Past weeks' actuals come from LabourWeekActual (payroll upload / Xero).
 * This function intentionally does NOT backfill history — syncing every
 * shift forever creates noise without signal.
 */
/**
 * Build the OperationalUnit → { venue, name } lookup from the JSON column
 * the user set up in /settings/integrations. Name is captured so each
 * shift row carries the area string ("Kitchen", "FOH", "Salary X", etc.)
 * that the department-bucket labour % math needs.
 */
function loadLocationMap(
  locations: unknown
): Map<number, { venue: Venue; name: string }> {
  const map = new Map<number, { venue: Venue; name: string }>()
  for (const row of (locations as
    | { id: number; venue: Venue; name?: string }[]
    | undefined) ?? []) {
    map.set(row.id, { venue: row.venue, name: row.name ?? "" })
  }
  return map
}

export async function syncDeputyRoster() {
  const connection = await getConnection()
  const locMap = loadLocationMap(connection.locations)
  if (locMap.size === 0) {
    throw new Error(
      "No Deputy location mappings configured — visit Settings → Integrations → Deputy"
    )
  }

  const { liveRosterWindowUnix, startOfTarteWeekUtc } = await import(
    "@/lib/dates"
  )
  const { sinceUnix, untilUnix } = liveRosterWindowUnix()

  const [rosters, employees, planSales] = await Promise.all([
    listRosterBetween(sinceUnix, untilUnix),
    listEmployees(),
    listPlanSalesBetween(sinceUnix, untilUnix),
  ])
  const empMap = new Map(employees.map((e) => [e.Id, e]))

  const safeDecimal = (v: unknown): InstanceType<typeof Decimal> =>
    new Decimal(typeof v === "number" || typeof v === "string" ? v : 0)
  const safeDecimalOrNull = (
    v: unknown
  ): InstanceType<typeof Decimal> | null =>
    v == null ? null : safeDecimal(v)

  // Clear any previously-synced ROSTER rows in the window so we don't keep
  // stale/deleted shifts around. We key on source='ROSTER' and
  // shiftStart within the window.
  const windowStart = new Date(sinceUnix * 1000)
  const windowEnd = new Date(untilUnix * 1000)
  await db.labourShift.deleteMany({
    where: {
      source: "ROSTER",
      shiftStart: { gte: windowStart, lt: windowEnd },
    },
  })

  let upserted = 0
  let skipped = 0
  const skippedOpUnits = new Map<number, number>()
  for (const r of rosters) {
    const loc = locMap.get(r.OperationalUnit)
    if (!loc) {
      skipped += 1
      skippedOpUnits.set(
        r.OperationalUnit,
        (skippedOpUnits.get(r.OperationalUnit) ?? 0) + 1
      )
      continue
    }
    const startMs = Number(r.StartTime) * 1000
    const endMs = Number(r.EndTime) * 1000
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      skipped += 1
      continue
    }
    const hoursNum =
      typeof r.TotalTime === "number" && r.TotalTime > 0
        ? r.TotalTime
        : (endMs - startMs) / 1000 / 3600
    const emp = empMap.get(r.Employee)
    const empRate =
      typeof emp?.PayRate === "number" && emp.PayRate > 0 ? emp.PayRate : null
    // Only treat Deputy's own Open flag as unfilled. An employee being
    // missing from our empMap usually just means Deputy paginated the
    // Employee resource — the shift itself is really assigned and has
    // a valid Cost we should still use. (Previously these were silently
    // zeroed, which is why live Bakery wages came in ~50% under.)
    const isOpen = r.Open === true
    // Store raw Deputy cost only — super + open-shift rate are applied
    // at display time in /labour so Settings tweaks are instant.
    const effectiveCost = isOpen
      ? 0
      : typeof r.OnCost === "number" && r.OnCost > 0
        ? r.OnCost
        : typeof r.Cost === "number" && r.Cost > 0
          ? r.Cost
          : empRate !== null
            ? empRate * hoursNum
            : 0

    await db.labourShift.create({
      data: {
        deputyId: `roster-${r.Id}`,
        employeeName: emp?.DisplayName ?? `Employee #${r.Employee}`,
        employeeId: String(r.Employee),
        venue: loc.venue,
        shiftStart: new Date(startMs),
        shiftEnd: new Date(endMs),
        hours: safeDecimal(hoursNum),
        cost: safeDecimal(effectiveCost),
        payRate: safeDecimalOrNull(empRate),
        area: loc.name || null,
        approved: false,
        isOpen,
        source: "ROSTER",
      },
    })
    upserted += 1
  }

  // ---- Manager sales forecast (plan_Sales) → ManagerSalesForecast ----
  // plan_Sales rows are daily per operational unit; we sum them per
  // (venue, Wed-week) and upsert into ManagerSalesForecast. Source=DEPUTY
  // so manual overrides (source=MANUAL) still win.
  const forecastByKey = new Map<string, number>() // "<venue>|<wedIso>" → $
  for (const ps of planSales) {
    const loc = locMap.get(ps.OperationalUnit)
    if (!loc) continue
    const venue = loc.venue
    const d = new Date(ps.Timestamp * 1000)
    const wedStart = startOfTarteWeekUtc(d)
    const key = `${venue}|${wedStart.toISOString().split("T")[0]}`
    forecastByKey.set(
      key,
      (forecastByKey.get(key) ?? 0) + Number(ps.SalesAmount || 0)
    )
  }
  let forecastsWritten = 0
  for (const [key, amount] of forecastByKey.entries()) {
    const [venue, wedIso] = key.split("|")
    const wedDate = new Date(wedIso)
    // Only overwrite rows that came from DEPUTY (or don't exist yet) —
    // a MANUAL override should not be clobbered by a sync.
    const existing = await db.managerSalesForecast.findUnique({
      where: {
        venue_weekStartWed: { venue: venue as Venue, weekStartWed: wedDate },
      },
    })
    if (existing && existing.source === "MANUAL") continue
    await db.managerSalesForecast.upsert({
      where: {
        venue_weekStartWed: { venue: venue as Venue, weekStartWed: wedDate },
      },
      create: {
        venue: venue as Venue,
        weekStartWed: wedDate,
        amount: new Decimal(Math.round(amount * 100) / 100),
        source: "DEPUTY",
      },
      update: {
        amount: new Decimal(Math.round(amount * 100) / 100),
        source: "DEPUTY",
      },
    })
    forecastsWritten += 1
  }

  await db.deputyConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  })

  if (skippedOpUnits.size > 0) {
    console.log(
      "[deputy/roster] skipped op-units (not in locMap):",
      Object.fromEntries(skippedOpUnits.entries())
    )
  }

  return {
    upserted,
    skipped,
    forecastsWritten,
    total: rosters.length,
    windowStart: windowStart.toISOString().split("T")[0],
    windowEnd: windowEnd.toISOString().split("T")[0],
  }
}

/**
 * Pull actual Timesheet rows from Deputy for the current Tarte trading
 * week (Wed → Tue). Unlike the Roster sync, these capture *live* clock-in
 * / clock-out activity — they materialise the second a barista scans in,
 * regardless of approval status. That's what the live FOH tracker needs.
 *
 * Approved timesheets settle into payroll on Wednesday; the data we read
 * here is the same shape Deputy stores from the moment the shift opens.
 *
 * Cost handling matches Deputy's own convention: salaried staff have
 * `Cost = 0` on their timesheet rows (their weekly salary lives on a
 * separate "Salary X" placeholder employee). Open shifts have no
 * timesheet row at all — they only exist on Roster.
 */
export async function syncDeputyTimesheets() {
  const connection = await getConnection()
  const locMap = loadLocationMap(connection.locations)
  if (locMap.size === 0) {
    throw new Error(
      "No Deputy location mappings configured — visit Settings → Integrations → Deputy"
    )
  }

  const { startOfTarteWeekUtc } = await import("@/lib/dates")
  // Pull from the start of last Tarte week so anything that landed
  // late (approval after Tuesday close) still re-syncs cleanly.
  const wedAest = startOfTarteWeekUtc(new Date())
  const lastWedAest = new Date(wedAest)
  lastWedAest.setUTCDate(lastWedAest.getUTCDate() - 7)
  // Subtract 10h to project back into actual UTC instant of Wed 00:00 AEST.
  const sinceUnix =
    Math.floor(lastWedAest.getTime() / 1000) - 10 * 3600

  const [timesheets, employees] = await Promise.all([
    listTimesheetsSince(sinceUnix),
    listEmployees(),
  ])
  const empMap = new Map(employees.map((e) => [e.Id, e]))

  const safeDecimal = (v: unknown): InstanceType<typeof Decimal> =>
    new Decimal(typeof v === "number" || typeof v === "string" ? v : 0)
  const safeDecimalOrNull = (
    v: unknown
  ): InstanceType<typeof Decimal> | null =>
    v == null ? null : safeDecimal(v)

  // Idempotent: replace the window's TIMESHEET rows so updates from
  // mid-shift edits (clock-out time corrections, manager adjustments)
  // are picked up cleanly.
  const windowStart = new Date(sinceUnix * 1000)
  await db.labourShift.deleteMany({
    where: { source: "TIMESHEET", shiftStart: { gte: windowStart } },
  })

  let upserted = 0
  let skipped = 0
  const skippedOpUnits = new Map<number, number>()
  for (const t of timesheets) {
    const loc = locMap.get(t.OperationalUnit)
    if (!loc) {
      skipped += 1
      skippedOpUnits.set(
        t.OperationalUnit,
        (skippedOpUnits.get(t.OperationalUnit) ?? 0) + 1
      )
      continue
    }
    const startMs = Number(t.StartTime) * 1000
    const endMs = Number(t.EndTime) * 1000
    if (!Number.isFinite(startMs)) {
      skipped += 1
      continue
    }
    // Open / in-progress shifts have no EndTime yet. Use now() for the
    // elapsed-hours calc so the live tracker can see accruing labour.
    const effectiveEndMs = Number.isFinite(endMs) && endMs > 0 ? endMs : Date.now()
    const hoursNum =
      typeof t.TotalTime === "number" && t.TotalTime > 0
        ? t.TotalTime
        : (effectiveEndMs - startMs) / 1000 / 3600
    const emp = empMap.get(t.Employee)
    const empRate =
      typeof emp?.PayRate === "number" && emp.PayRate > 0 ? emp.PayRate : null
    // For Timesheet rows we TRUST what Deputy stored. Cost=0 means the
    // employee is salaried (their weekly cost sits on a "Salary X"
    // placeholder row instead). Don't re-derive from PayRate — that
    // would double-count salaried staff.
    const cost = typeof t.Cost === "number" ? t.Cost : 0

    await db.labourShift.create({
      data: {
        deputyId: `timesheet-${t.Id}`,
        employeeName: emp?.DisplayName ?? `Employee #${t.Employee}`,
        employeeId: String(t.Employee),
        venue: loc.venue,
        shiftStart: new Date(startMs),
        shiftEnd: new Date(effectiveEndMs),
        hours: safeDecimal(hoursNum),
        cost: safeDecimal(cost),
        payRate: safeDecimalOrNull(empRate),
        area: loc.name || null,
        approved: Boolean(t.Approved),
        isOpen: false, // Open shifts never have Timesheet rows
        source: "TIMESHEET",
      },
    })
    upserted += 1
  }

  if (skippedOpUnits.size > 0) {
    console.log(
      "[deputy/timesheets] skipped op-units (not in locMap):",
      Object.fromEntries(skippedOpUnits.entries())
    )
  }

  return {
    upserted,
    skipped,
    total: timesheets.length,
    windowStart: windowStart.toISOString().split("T")[0],
  }
}

/**
 * Run both syncs (roster + timesheets) in sequence. Called by the
 * /api/cron/sync-deputy endpoint and by the Settings "Sync now" button.
 */
export async function syncDeputyAll() {
  const roster = await syncDeputyRoster()
  const timesheets = await syncDeputyTimesheets()
  return { roster, timesheets }
}
