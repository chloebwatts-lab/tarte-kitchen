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

export async function listEmployees(): Promise<DeputyEmployee[]> {
  return deputyFetch<DeputyEmployee[]>("/api/v1/resource/Employee")
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
export async function syncDeputyRoster() {
  const connection = await getConnection()
  const locMap = new Map<number, Venue>()
  for (const row of (connection.locations as { id: number; venue: Venue }[]) ??
    []) {
    locMap.set(row.id, row.venue)
  }
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
    const venue = locMap.get(r.OperationalUnit)
    if (!venue) {
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
    const onCost =
      typeof r.OnCost === "number" && r.OnCost > 0 ? r.OnCost : null
    const baseCost =
      typeof r.Cost === "number" && r.Cost > 0 ? r.Cost : null
    const isOpenShift = r.Open === true || !emp || r.Employee === 0
    const superMultiplier = 1 + Number(connection.superRate ?? 0.12)
    const openShiftRate = Number(connection.defaultOpenShiftRate ?? 30)
    // Priority:
    //   1. OnCost — Deputy's own fully-loaded figure (super already baked
    //      in if configured per-employee in Deputy). Use verbatim.
    //   2. Cost × (1 + superRate) — base wage from Deputy, we load super
    //      ourselves so the labour % still includes on-costs.
    //   3. empRate × hours × (1 + superRate) — nominal payrate, loaded.
    //   4. openShiftRate × hours × (1 + superRate) — unfilled shifts.
    //   5. 0 — salary staff (payrate=0 in Deputy, intentional).
    const effectiveCost =
      onCost ??
      (baseCost !== null
        ? baseCost * superMultiplier
        : empRate !== null
          ? empRate * hoursNum * superMultiplier
          : isOpenShift
            ? openShiftRate * hoursNum * superMultiplier
            : 0)

    await db.labourShift.create({
      data: {
        deputyId: `roster-${r.Id}`,
        employeeName: emp?.DisplayName ?? `Employee #${r.Employee}`,
        employeeId: String(r.Employee),
        venue,
        shiftStart: new Date(startMs),
        shiftEnd: new Date(endMs),
        hours: safeDecimal(hoursNum),
        cost: safeDecimal(effectiveCost),
        payRate: safeDecimalOrNull(empRate),
        approved: false,
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
    const venue = locMap.get(ps.OperationalUnit)
    if (!venue) continue
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

// Legacy alias — the old action button + cron endpoint called this name.
// Points at the new Roster-based sync so /api/cron/sync-deputy keeps working.
export const syncDeputyTimesheets = syncDeputyRoster
