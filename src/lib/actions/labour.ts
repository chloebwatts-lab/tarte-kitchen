"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"
import { currentTarteWeekRange, startOfTarteWeekUtc, weekStartWedIso } from "@/lib/dates"
import Decimal from "decimal.js"

// ----------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------

export interface LabourWeekCard {
  weekStartWed: string
  label: string // "Wed 22 Apr – Tue 28 Apr"
  kind: "LIVE" | "NEXT" | "PAST"
  perVenue: {
    venue: Venue
    scheduledHours: number | null
    scheduledWages: number | null // from Roster (forward-looking)
    actualHours: number | null // from LabourWeekActual (past weeks)
    actualWages: number | null
    mForecast: number | null // manager's sales forecast ex GST
    labourPct: number | null // (wages / mForecast) * 100
    hasActuals: boolean
  }[]
}

export interface LabourDashboardData {
  liveWeek: LabourWeekCard
  nextWeek: LabourWeekCard
  pastWeeks: LabourWeekCard[]
  hasDeputyConnection: boolean
}

// ----------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------

export async function getLabourDashboardData(): Promise<LabourDashboardData> {
  const now = new Date()
  const { start: liveStart } = currentTarteWeekRange(now)
  const nextStart = new Date(liveStart)
  nextStart.setUTCDate(nextStart.getUTCDate() + 7)
  const past8Start = new Date(liveStart)
  past8Start.setUTCDate(past8Start.getUTCDate() - 7 * 8) // last 8 past weeks

  const connection = await db.deputyConnection.findFirst()
  const hasDeputyConnection = !!connection

  // Pull everything in parallel — 3 queries total.
  const [rosterShifts, actuals, forecasts] = await Promise.all([
    db.labourShift.findMany({
      where: {
        source: "ROSTER",
        shiftStart: { gte: liveStart },
      },
      select: { venue: true, shiftStart: true, hours: true, cost: true },
    }),
    db.labourWeekActual.findMany({
      where: { weekStartWed: { gte: past8Start } },
    }),
    db.managerSalesForecast.findMany({
      where: { weekStartWed: { gte: past8Start } },
    }),
  ])

  const forecastByKey = new Map<string, number>()
  for (const f of forecasts) {
    forecastByKey.set(
      `${f.venue}|${weekStartWedIso(f.weekStartWed)}`,
      Number(f.amount)
    )
  }

  const actualsByKey = new Map<string, (typeof actuals)[number]>()
  for (const a of actuals) {
    actualsByKey.set(`${a.venue}|${weekStartWedIso(a.weekStartWed)}`, a)
  }

  // Bucket ROSTER shifts into (venue, weekStartWed)
  const rosterBucket = new Map<string, { hours: number; cost: number }>()
  for (const s of rosterShifts) {
    const wk = weekStartWedIso(startOfTarteWeekUtc(s.shiftStart))
    const key = `${s.venue}|${wk}`
    const existing = rosterBucket.get(key) ?? { hours: 0, cost: 0 }
    existing.hours += Number(s.hours)
    existing.cost += Number(s.cost)
    rosterBucket.set(key, existing)
  }

  function buildCard(
    weekStart: Date,
    kind: "LIVE" | "NEXT" | "PAST"
  ): LabourWeekCard {
    const iso = weekStartWedIso(weekStart)
    const perVenue = SINGLE_VENUES.map((v) => {
      const key = `${v}|${iso}`
      const roster = rosterBucket.get(key)
      const actual = actualsByKey.get(key)
      const forecast =
        actual?.mForecast !== null && actual?.mForecast !== undefined
          ? Number(actual.mForecast)
          : forecastByKey.get(key) ?? null

      // Choose the authoritative wage total for this card:
      //   - past weeks prefer actuals
      //   - live + next weeks prefer rostered
      const wages =
        kind === "PAST"
          ? actual
            ? Number(actual.grossWages)
            : null
          : roster?.cost ?? null
      const hours =
        kind === "PAST"
          ? actual?.totalHours != null
            ? Number(actual.totalHours)
            : null
          : roster?.hours ?? null

      const labourPct =
        wages !== null && forecast !== null && forecast > 0
          ? Math.round((wages / forecast) * 10000) / 100
          : null

      return {
        venue: v,
        scheduledHours: kind === "PAST" ? null : roster?.hours ?? null,
        scheduledWages: kind === "PAST" ? null : roster?.cost ?? null,
        actualHours: kind === "PAST" && actual?.totalHours != null
          ? Number(actual.totalHours)
          : null,
        actualWages: kind === "PAST" && actual
          ? Number(actual.grossWages)
          : null,
        mForecast: forecast,
        labourPct,
        hasActuals: !!actual,
      }
    })
    return {
      weekStartWed: iso,
      label: tarteLabel(weekStart),
      kind,
      perVenue,
    }
  }

  const pastWeeks: LabourWeekCard[] = []
  for (let i = 1; i <= 8; i++) {
    const start = new Date(liveStart)
    start.setUTCDate(start.getUTCDate() - 7 * i)
    pastWeeks.push(buildCard(start, "PAST"))
  }

  return {
    liveWeek: buildCard(liveStart, "LIVE"),
    nextWeek: buildCard(nextStart, "NEXT"),
    pastWeeks,
    hasDeputyConnection,
  }
}

function tarteLabel(weekStartWed: Date): string {
  const end = new Date(weekStartWed)
  end.setUTCDate(end.getUTCDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
    })
  return `${fmt(weekStartWed)} – ${fmt(end)}`
}

// ----------------------------------------------------------------------
// Manager forecast + actuals writes
// ----------------------------------------------------------------------

export async function setManagerForecast(params: {
  venue: Venue
  weekStartWed: string
  amount: number
  enteredBy?: string
}) {
  const wk = startOfTarteWeekUtc(new Date(params.weekStartWed))
  await db.managerSalesForecast.upsert({
    where: {
      venue_weekStartWed: { venue: params.venue, weekStartWed: wk },
    },
    create: {
      venue: params.venue,
      weekStartWed: wk,
      amount: new Decimal(params.amount),
      source: "MANUAL",
      enteredBy: params.enteredBy ?? null,
    },
    update: {
      amount: new Decimal(params.amount),
      source: "MANUAL",
      enteredBy: params.enteredBy ?? null,
    },
  })
  revalidatePath("/labour")
}

export async function upsertLabourWeekActual(params: {
  venue: Venue
  weekStartWed: string
  grossWages: number
  superAmount?: number
  totalHours?: number | null
  headcount?: number | null
  mForecast?: number | null
  notes?: string | null
  uploadId?: string | null
}) {
  const wk = startOfTarteWeekUtc(new Date(params.weekStartWed))
  await db.labourWeekActual.upsert({
    where: {
      venue_weekStartWed: { venue: params.venue, weekStartWed: wk },
    },
    create: {
      venue: params.venue,
      weekStartWed: wk,
      grossWages: new Decimal(params.grossWages),
      superAmount: new Decimal(params.superAmount ?? 0),
      totalHours:
        params.totalHours != null ? new Decimal(params.totalHours) : null,
      headcount: params.headcount ?? null,
      mForecast:
        params.mForecast != null ? new Decimal(params.mForecast) : null,
      notes: params.notes ?? null,
      uploadId: params.uploadId ?? null,
      source: params.uploadId ? "UPLOAD" : "MANUAL",
    },
    update: {
      grossWages: new Decimal(params.grossWages),
      superAmount: new Decimal(params.superAmount ?? 0),
      totalHours:
        params.totalHours != null ? new Decimal(params.totalHours) : null,
      headcount: params.headcount ?? null,
      mForecast:
        params.mForecast != null ? new Decimal(params.mForecast) : null,
      notes: params.notes ?? null,
      uploadId: params.uploadId ?? null,
    },
  })
  revalidatePath("/labour")
}

// ----------------------------------------------------------------------
// CSV upload parser
// ----------------------------------------------------------------------

export interface ParsedCsvRow {
  venue: Venue | null
  venueRaw: string
  weekStartWed: string
  grossWages: number
  superAmount: number
  totalHours: number | null
  mForecast: number | null
}

/**
 * Parse a bookkeeper CSV. Expected columns (case-insensitive, flexible order):
 *   venue, week_start (yyyy-mm-dd, Wednesday), gross_wages, super, hours, m_forecast
 *
 * Returns an array of parsed rows plus errors. Does NOT write to DB —
 * preview first, then the user confirms.
 */
export async function parseLabourCsv(raw: string): Promise<{
  rows: ParsedCsvRow[]
  errors: string[]
}> {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV needs a header row and at least one data row"] }
  }
  const header = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase().replace(/[^a-z_]/g, ""))
  const indexOf = (...names: string[]) =>
    names
      .map((n) => header.indexOf(n))
      .find((i) => i >= 0) ?? -1
  const iVenue = indexOf("venue", "site", "location")
  const iWeek = indexOf("week_start", "weekstart", "week", "wedweekstart")
  const iWages = indexOf("gross_wages", "grosswages", "wages", "gross")
  const iSuper = indexOf("super", "superamount", "superannuation")
  const iHours = indexOf("hours", "total_hours", "totalhours")
  const iForecast = indexOf("m_forecast", "mforecast", "forecast", "sales_forecast")

  const errors: string[] = []
  if (iVenue < 0) errors.push("Missing column: venue")
  if (iWeek < 0) errors.push("Missing column: week_start")
  if (iWages < 0) errors.push("Missing column: gross_wages")

  if (errors.length > 0) return { rows: [], errors }

  const rows: ParsedCsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""))
    const venueRaw = cols[iVenue] ?? ""
    const venue = matchVenue(venueRaw)
    const weekRaw = cols[iWeek] ?? ""
    const wages = parseFloat(cols[iWages] ?? "0") || 0
    const superAmt = iSuper >= 0 ? parseFloat(cols[iSuper] ?? "0") || 0 : 0
    const hours = iHours >= 0 ? parseFloat(cols[iHours] ?? "") : NaN
    const forecast = iForecast >= 0 ? parseFloat(cols[iForecast] ?? "") : NaN

    let weekIso = weekRaw
    try {
      const d = new Date(weekRaw)
      if (!Number.isNaN(d.getTime())) {
        weekIso = weekStartWedIso(d)
      } else {
        errors.push(`Row ${i + 1}: unparseable week_start "${weekRaw}"`)
        continue
      }
    } catch {
      errors.push(`Row ${i + 1}: unparseable week_start "${weekRaw}"`)
      continue
    }

    rows.push({
      venue,
      venueRaw,
      weekStartWed: weekIso,
      grossWages: wages,
      superAmount: superAmt,
      totalHours: Number.isFinite(hours) ? hours : null,
      mForecast: Number.isFinite(forecast) ? forecast : null,
    })
  }
  return { rows, errors }
}

function matchVenue(raw: string): Venue | null {
  const s = raw.toUpperCase().trim()
  if (s.includes("BURLEIGH") || s.includes("BAKERY")) return "BURLEIGH"
  if (s.includes("BEACH")) return "BEACH_HOUSE"
  if (s.includes("TEA")) return "TEA_GARDEN"
  return null
}

export async function commitLabourCsv(params: {
  filename: string
  rawCsv: string
  rows: {
    venue: Venue
    weekStartWed: string
    grossWages: number
    superAmount: number
    totalHours: number | null
    mForecast: number | null
  }[]
  uploadedBy?: string
}) {
  const upload = await db.labourUpload.create({
    data: {
      filename: params.filename,
      rawCsv: params.rawCsv,
      weekCount: params.rows.length,
      uploadedBy: params.uploadedBy ?? null,
    },
  })
  for (const r of params.rows) {
    await upsertLabourWeekActual({
      ...r,
      uploadId: upload.id,
    })
  }
  revalidatePath("/labour")
  return { uploadId: upload.id, rows: params.rows.length }
}

export async function hasDeputyConnection() {
  const c = await db.deputyConnection.findFirst()
  return !!c
}
