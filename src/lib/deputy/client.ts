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
  OpUnit: number
  StartTime: number // unix seconds
  EndTime: number
  Open: boolean
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
 * Pull Deputy timesheets since the last sync and upsert them into
 * LabourShift. Returns a summary of what happened. Called by the cron at
 * /api/cron/sync-deputy.
 *
 * Requires the DeputyConnection.locations JSON to map Deputy OpUnit ids to
 * our Venue enum — we don't guess. This gets populated from the settings
 * page when the user first connects.
 */
export async function syncDeputyTimesheets() {
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

  const since = connection.lastSyncedAt
    ? Math.floor(connection.lastSyncedAt.getTime() / 1000) - 60 * 60 * 24 // overlap by a day
    : Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 28 // backfill 4 weeks

  const [timesheets, employees] = await Promise.all([
    listTimesheetsSince(since),
    listEmployees(),
  ])
  const empMap = new Map(employees.map((e) => [e.Id, e]))

  let upserted = 0
  let skipped = 0
  const skippedOpUnits = new Map<number, number>() // op-unit id → count
  for (const t of timesheets) {
    const venue = locMap.get(t.OperationalUnit)
    if (!venue) {
      skipped += 1
      skippedOpUnits.set(
        t.OperationalUnit,
        (skippedOpUnits.get(t.OperationalUnit) ?? 0) + 1
      )
      continue
    }
    const emp = empMap.get(t.Employee)
    const name = emp?.DisplayName ?? `Employee #${t.Employee}`
    // Defensive: coerce every numeric to a safe value before handing to
    // Decimal. Deputy's Timesheet rows occasionally have null/undefined
    // for PayRate (unpriced shifts) and have been seen to omit Cost on
    // rosters that haven't been costed yet.
    const safeDecimal = (v: unknown): InstanceType<typeof Decimal> =>
      new Decimal(
        typeof v === "number" || typeof v === "string" ? v : 0
      )
    const safeDecimalOrNull = (
      v: unknown
    ): InstanceType<typeof Decimal> | null =>
      v == null ? null : safeDecimal(v)

    const startMs = Number(t.StartTime) * 1000
    const endMs = Number(t.EndTime) * 1000
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      skipped += 1
      continue
    }

    // Deputy only populates Timesheet.Cost + Timesheet.PayRate after the
    // shift is approved / exported to payroll. For unapproved shifts we
    // estimate cost from the employee's nominal PayRate so /labour has
    // live numbers instead of $0. If Employee.PayRate is also missing
    // we fall back to 0 and let the approved shifts populate later.
    const tsRate =
      typeof t.PayRate === "number" && t.PayRate > 0 ? t.PayRate : null
    const empRate =
      typeof emp?.PayRate === "number" && emp.PayRate > 0 ? emp.PayRate : null
    const effectiveRate = tsRate ?? empRate ?? null
    const hoursNum = typeof t.TotalTime === "number" ? t.TotalTime : 0
    const tsCost =
      typeof t.Cost === "number" && t.Cost > 0 ? t.Cost : null
    const effectiveCost =
      tsCost ?? (effectiveRate !== null ? effectiveRate * hoursNum : 0)

    await db.labourShift.upsert({
      where: { deputyId: String(t.Id) },
      create: {
        deputyId: String(t.Id),
        employeeName: name,
        employeeId: String(t.Employee),
        venue,
        shiftStart: new Date(startMs),
        shiftEnd: new Date(endMs),
        hours: safeDecimal(hoursNum),
        cost: safeDecimal(effectiveCost),
        payRate: safeDecimalOrNull(effectiveRate),
        approved: !!t.Approved,
      },
      update: {
        employeeName: name,
        shiftStart: new Date(startMs),
        shiftEnd: new Date(endMs),
        hours: safeDecimal(hoursNum),
        cost: safeDecimal(effectiveCost),
        payRate: safeDecimalOrNull(effectiveRate),
        approved: !!t.Approved,
      },
    })
    upserted += 1
  }

  await db.deputyConnection.update({
    where: { id: connection.id },
    data: { lastSyncedAt: new Date() },
  })

  if (skippedOpUnits.size > 0) {
    console.log(
      "[deputy/sync] skipped op-units (not in locMap):",
      Object.fromEntries(skippedOpUnits.entries())
    )
  }

  return { upserted, skipped, total: timesheets.length }
}
