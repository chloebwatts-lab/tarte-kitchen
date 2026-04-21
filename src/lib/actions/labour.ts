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
    labourPct: number | null // (wages / revenue-or-forecast) * 100
    hasActuals: boolean
    // Rich Mge-PDF fields (past weeks, when uploaded)
    actualRevenueExGst: number | null
    actualWagesExAdmin: number | null
    actualWagesExAdminLeaveBackpay: number | null
    actualWagesLessLeaveBackpay: number | null
    actualCogs: number | null
    actualCogsPct: number | null
    wagesBarista: number | null
    wagesChef: number | null
    wagesFoh: number | null
    wagesKp: number | null
    wagesPastry: number | null
    wagesAdmin: number | null
    // Theoretical COGS (from DailySalesSummary.theoreticalCogs recipe rollup)
    // aggregated for this Wed–Tue window. Lets the UI show actual vs theory.
    theoreticalCogs: number | null
    theoreticalCogsPct: number | null
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
  // Shift filter uses the true UTC instant of Wed 00:00 AEST so the
  // 4am Wednesday bakery shifts (StartTime = Tue 18:00 UTC) aren't
  // accidentally excluded from the current live week.
  const liveStartAestInstant = new Date(
    liveStart.getTime() - 10 * 60 * 60 * 1000
  )

  const connection = await db.deputyConnection.findFirst()
  const hasDeputyConnection = !!connection
  // Apply wage settings at display time so tweaks in Settings are
  // instant — no Deputy re-sync required. See syncDeputyRoster: raw
  // Deputy cost is stored on LabourShift.cost (0 for open shifts);
  // super + open-shift $/hr are layered on here.
  const superMultiplier = 1 + Number(connection?.superRate ?? 0.12)
  const openShiftRate = Number(connection?.defaultOpenShiftRate ?? 0)
  // Workers' comp + payroll tax uplift. Deputy's Insights page includes
  // these but the Roster API's Cost/OnCost fields don't — so we stack
  // this on top of the super multiplier at display time.
  const upliftMultiplier = 1 + Number(connection?.onCostUpliftRate ?? 0)

  // Pull everything in parallel. Sales summaries drive theoretical COGS
  // (actual POS revenue × recipe costs) so we can cross-check against
  // the actual COGS figure in the Mge PDF.
  const [rosterShifts, actuals, forecasts, sales] = await Promise.all([
    db.labourShift.findMany({
      where: {
        source: "ROSTER",
        shiftStart: { gte: liveStartAestInstant },
      },
      select: {
        venue: true,
        shiftStart: true,
        hours: true,
        cost: true,
        isOpen: true,
      },
    }),
    db.labourWeekActual.findMany({
      where: { weekStartWed: { gte: past8Start } },
    }),
    db.managerSalesForecast.findMany({
      where: { weekStartWed: { gte: past8Start } },
    }),
    db.dailySalesSummary.findMany({
      where: { date: { gte: past8Start } },
      select: {
        date: true,
        venue: true,
        totalRevenueExGst: true,
        theoreticalCogs: true,
      },
    }),
  ])

  // Aggregate POS revenue + theoretical COGS per (venue, Wed-week) so we
  // can compare against the Mge PDF's "This Week" COGS % line-for-line.
  const posByKey = new Map<
    string,
    { revenue: number; theoreticalCogs: number | null }
  >()
  for (const s of sales) {
    const wk = weekStartWedIso(startOfTarteWeekUtc(s.date))
    const key = `${s.venue}|${wk}`
    const existing = posByKey.get(key) ?? { revenue: 0, theoreticalCogs: null }
    existing.revenue += Number(s.totalRevenueExGst)
    if (s.theoreticalCogs != null) {
      existing.theoreticalCogs =
        (existing.theoreticalCogs ?? 0) + Number(s.theoreticalCogs)
    }
    posByKey.set(key, existing)
  }

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

  // Bucket ROSTER shifts into (venue, weekStartWed). Cost model:
  //   - Assigned shifts: stored cost × superMultiplier
  //   - Open shifts:    hours × openShiftRate × superMultiplier
  const rosterBucket = new Map<string, { hours: number; cost: number }>()
  for (const s of rosterShifts) {
    const wk = weekStartWedIso(startOfTarteWeekUtc(s.shiftStart))
    const key = `${s.venue}|${wk}`
    const existing = rosterBucket.get(key) ?? { hours: 0, cost: 0 }
    const hrs = Number(s.hours)
    const baseCost = s.isOpen ? hrs * openShiftRate : Number(s.cost)
    existing.hours += hrs
    existing.cost += baseCost * superMultiplier * upliftMultiplier
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
      const pos = posByKey.get(key)
      const forecast =
        actual?.mForecast !== null && actual?.mForecast !== undefined
          ? Number(actual.mForecast)
          : forecastByKey.get(key) ?? null

      // Mge-PDF rich fields (past weeks). These are preferred over the
      // plain gross_wages number from CSV uploads because they match
      // what Deputy's Insights roster shows (salary admin excluded).
      const actualRevenueExGst =
        actual?.revenueExGst != null ? Number(actual.revenueExGst) : null
      const actualWagesExAdmin =
        actual?.grossWagesExAdmin != null
          ? Number(actual.grossWagesExAdmin)
          : null
      const actualWagesExAdminLeaveBackpay =
        actual?.grossWagesExAdminLeaveBackpay != null
          ? Number(actual.grossWagesExAdminLeaveBackpay)
          : null
      const actualWagesLessLeaveBackpay =
        actual?.grossWagesLessLeaveBackpay != null
          ? Number(actual.grossWagesLessLeaveBackpay)
          : null
      const actualCogs =
        actual?.cogsActual != null ? Number(actual.cogsActual) : null
      const actualCogsPct =
        actual?.cogsPct != null ? Number(actual.cogsPct) : null

      // Wage total for this card:
      //   - past weeks: prefer ex-admin (matches roster), else full gross
      //   - live + next weeks: rostered (already ex-admin since salary
      //     staff are mapped to a single aggregate in Deputy)
      const wages =
        kind === "PAST"
          ? actualWagesExAdmin ??
            (actual ? Number(actual.grossWages) : null)
          : roster?.cost ?? null
      // Denominator: prefer the actual revenue from the Mge PDF; else
      // fall back to POS-aggregated revenue; else manager's forecast.
      const denom =
        kind === "PAST"
          ? actualRevenueExGst ?? pos?.revenue ?? forecast
          : forecast

      const labourPct =
        wages !== null && denom !== null && denom > 0
          ? Math.round((wages / denom) * 10000) / 100
          : null

      // POS-derived theoretical COGS (recipe rollup × actual daily sales).
      const theoreticalCogs = pos?.theoreticalCogs ?? null
      const theoreticalCogsPct =
        theoreticalCogs !== null && pos && pos.revenue > 0
          ? Math.round((theoreticalCogs / pos.revenue) * 10000) / 100
          : null

      return {
        venue: v,
        scheduledHours: kind === "PAST" ? null : roster?.hours ?? null,
        scheduledWages: kind === "PAST" ? null : roster?.cost ?? null,
        actualHours:
          kind === "PAST" && actual?.totalHours != null
            ? Number(actual.totalHours)
            : null,
        actualWages:
          kind === "PAST" && actual ? Number(actual.grossWages) : null,
        mForecast: forecast,
        labourPct,
        hasActuals: !!actual,
        actualRevenueExGst,
        actualWagesExAdmin,
        actualWagesExAdminLeaveBackpay,
        actualWagesLessLeaveBackpay,
        actualCogs,
        actualCogsPct,
        wagesBarista:
          actual?.wagesBarista != null ? Number(actual.wagesBarista) : null,
        wagesChef:
          actual?.wagesChef != null ? Number(actual.wagesChef) : null,
        wagesFoh: actual?.wagesFoh != null ? Number(actual.wagesFoh) : null,
        wagesKp: actual?.wagesKp != null ? Number(actual.wagesKp) : null,
        wagesPastry:
          actual?.wagesPastry != null ? Number(actual.wagesPastry) : null,
        wagesAdmin:
          actual?.wagesAdmin != null ? Number(actual.wagesAdmin) : null,
        theoreticalCogs,
        theoreticalCogsPct,
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

// ----------------------------------------------------------------------
// Rich management-report extraction
// ----------------------------------------------------------------------

export interface ExtractedMgeWeek {
  venue: Venue | null
  venueRaw: string
  weekStartWed: string // yyyy-mm-dd (Wed)
  revenueExGst: number | null
  grossWages: number | null
  grossWagesExAdmin: number | null
  grossWagesExAdminLeaveBackpay: number | null
  grossWagesLessLeaveBackpay: number | null
  superAmount: number | null
  totalHours: number | null
  wagesBarista: number | null
  wagesChef: number | null
  wagesFoh: number | null
  wagesKp: number | null
  wagesPastry: number | null
  wagesAdmin: number | null
  cogsActual: number | null
  cogsPct: number | null
  mForecast: number | null
}

/**
 * Hand the weekly management-report PDF ("Mge" / "Payroll Report") to
 * Claude and parse a structured payload covering revenue, department
 * wage breakdown, ex-admin totals, and COGS. Previous CSV path is kept
 * as a fallback in parseLabourCsv.
 *
 * Returns one row per week reported in the PDF (usually just one, but
 * multi-week reports are supported).
 */
export async function parseLabourPdfRich(params: {
  pdfBase64: string
  filename: string
}): Promise<{ weeks: ExtractedMgeWeek[]; notes?: string }> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prompt = `Extract the CURRENT WEEK management report from this PDF. Return ONLY a JSON object (no prose, no code fences) with shape:

{
  "weeks": [
    {
      "venue": "Burleigh" | "Beach House" | "Tea Garden",
      "week_ending_tuesday": "yyyy-mm-dd",
      "revenue_ex_gst": number | null,
      "gross_wages": number | null,
      "gross_wages_ex_admin": number | null,
      "gross_wages_ex_admin_leave_backpay": number | null,
      "gross_wages_less_leave_backpay": number | null,
      "super_amount": number | null,
      "total_hours": number | null,
      "wages_barista": number | null,
      "wages_chef": number | null,
      "wages_foh": number | null,
      "wages_kp": number | null,
      "wages_pastry": number | null,
      "wages_admin": number | null,
      "cogs_actual": number | null,
      "cogs_pct": number | null,
      "m_forecast": number | null
    }
  ]
}

Rules:
- All dollar figures are numbers (strip $ and commas). Percentages are numbers too (e.g. 36.17 for 36.17%).
- venue: "Burleigh" for Tarte Bakery Burleigh / Bakery, "Beach House" for Tarte Beach House, "Tea Garden" for Tarte Tea Garden.
- week_ending_tuesday: the Tuesday the report week ends on (look for "Week ending Tuesday …" or similar).
- Only the CURRENT week columns (not last week, not YTD, not monthly). If the PDF shows multiple weeks, emit one entry per week.
- "gross_wages" is the Total row under Current Week.
- "gross_wages_ex_admin" is the "Total less Admin" row under Current Week.
- "gross_wages_ex_admin_leave_backpay" is the "Less Admin, leave, backpay" row under Current Week.
- "gross_wages_less_leave_backpay" is the "Total less leave, toil, backpay" row (admin still included).
- Department wages are the department $ cells under Current Week — NOT the % columns.
- "cogs_actual" is the "This Week" COGS $ cell. "cogs_pct" is that row's % of Revenue.
- "m_forecast" only if a manager sales forecast is shown explicitly; otherwise null.
- Use null (not 0) for fields you can't find.`
  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: params.pdfBase64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  })
  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text response")
  }
  let raw = textBlock.text.trim()
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
  }
  let parsed: {
    weeks: {
      venue?: string
      week_ending_tuesday?: string
      revenue_ex_gst?: number | null
      gross_wages?: number | null
      gross_wages_ex_admin?: number | null
      gross_wages_ex_admin_leave_backpay?: number | null
      gross_wages_less_leave_backpay?: number | null
      super_amount?: number | null
      total_hours?: number | null
      wages_barista?: number | null
      wages_chef?: number | null
      wages_foh?: number | null
      wages_kp?: number | null
      wages_pastry?: number | null
      wages_admin?: number | null
      cogs_actual?: number | null
      cogs_pct?: number | null
      m_forecast?: number | null
    }[]
  }
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(
      `Claude returned invalid JSON: ${(e as Error).message}\nRaw: ${raw.slice(0, 300)}…`
    )
  }

  const weeks: ExtractedMgeWeek[] = (parsed.weeks ?? []).map((w) => {
    const venueRaw = w.venue ?? ""
    const venue = matchVenue(venueRaw)
    // Convert "week ending Tuesday Y-M-D" to the Wednesday that starts
    // the Tarte week — 6 days earlier.
    let weekStartWed = ""
    if (w.week_ending_tuesday) {
      const tue = new Date(w.week_ending_tuesday)
      if (!Number.isNaN(tue.getTime())) {
        const wed = new Date(tue)
        wed.setUTCDate(wed.getUTCDate() - 6)
        weekStartWed = weekStartWedIso(wed)
      }
    }
    return {
      venue,
      venueRaw,
      weekStartWed,
      revenueExGst: numOrNull(w.revenue_ex_gst),
      grossWages: numOrNull(w.gross_wages),
      grossWagesExAdmin: numOrNull(w.gross_wages_ex_admin),
      grossWagesExAdminLeaveBackpay: numOrNull(
        w.gross_wages_ex_admin_leave_backpay
      ),
      grossWagesLessLeaveBackpay: numOrNull(w.gross_wages_less_leave_backpay),
      superAmount: numOrNull(w.super_amount),
      totalHours: numOrNull(w.total_hours),
      wagesBarista: numOrNull(w.wages_barista),
      wagesChef: numOrNull(w.wages_chef),
      wagesFoh: numOrNull(w.wages_foh),
      wagesKp: numOrNull(w.wages_kp),
      wagesPastry: numOrNull(w.wages_pastry),
      wagesAdmin: numOrNull(w.wages_admin),
      cogsActual: numOrNull(w.cogs_actual),
      cogsPct: numOrNull(w.cogs_pct),
      mForecast: numOrNull(w.m_forecast),
    }
  })
  return { weeks, notes: `Extracted from ${params.filename}` }
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  const n = typeof v === "number" ? v : parseFloat(String(v))
  return Number.isFinite(n) ? n : null
}

/**
 * Commit rich Mge extractions into LabourWeekActual. Upserts per
 * (venue, week) — uploading the same PDF twice overwrites rather than
 * duplicating.
 */
export async function commitLabourMgePdf(params: {
  filename: string
  rawPdfBase64: string
  weeks: ExtractedMgeWeek[]
  uploadedBy?: string
}) {
  // Filter to valid weeks (venue resolved, week_start resolved).
  const valid = params.weeks.filter(
    (w): w is ExtractedMgeWeek & { venue: Venue } =>
      w.venue !== null && w.weekStartWed !== ""
  )
  if (valid.length === 0) {
    throw new Error("No valid weeks to commit (missing venue or week start)")
  }

  const upload = await db.labourUpload.create({
    data: {
      filename: params.filename,
      // Store the short filename context instead of the full PDF base64.
      rawCsv: `PDF upload: ${params.filename} (${valid.length} week${valid.length === 1 ? "" : "s"})`,
      weekCount: valid.length,
      uploadedBy: params.uploadedBy ?? null,
    },
  })

  for (const w of valid) {
    const wk = startOfTarteWeekUtc(new Date(w.weekStartWed))
    await db.labourWeekActual.upsert({
      where: { venue_weekStartWed: { venue: w.venue, weekStartWed: wk } },
      create: {
        venue: w.venue,
        weekStartWed: wk,
        grossWages: new Decimal(w.grossWages ?? 0),
        superAmount: new Decimal(w.superAmount ?? 0),
        totalHours:
          w.totalHours != null ? new Decimal(w.totalHours) : null,
        mForecast: w.mForecast != null ? new Decimal(w.mForecast) : null,
        revenueExGst:
          w.revenueExGst != null ? new Decimal(w.revenueExGst) : null,
        grossWagesExAdmin:
          w.grossWagesExAdmin != null
            ? new Decimal(w.grossWagesExAdmin)
            : null,
        grossWagesExAdminLeaveBackpay:
          w.grossWagesExAdminLeaveBackpay != null
            ? new Decimal(w.grossWagesExAdminLeaveBackpay)
            : null,
        grossWagesLessLeaveBackpay:
          w.grossWagesLessLeaveBackpay != null
            ? new Decimal(w.grossWagesLessLeaveBackpay)
            : null,
        wagesBarista:
          w.wagesBarista != null ? new Decimal(w.wagesBarista) : null,
        wagesChef: w.wagesChef != null ? new Decimal(w.wagesChef) : null,
        wagesFoh: w.wagesFoh != null ? new Decimal(w.wagesFoh) : null,
        wagesKp: w.wagesKp != null ? new Decimal(w.wagesKp) : null,
        wagesPastry:
          w.wagesPastry != null ? new Decimal(w.wagesPastry) : null,
        wagesAdmin:
          w.wagesAdmin != null ? new Decimal(w.wagesAdmin) : null,
        cogsActual:
          w.cogsActual != null ? new Decimal(w.cogsActual) : null,
        cogsPct: w.cogsPct != null ? new Decimal(w.cogsPct) : null,
        source: "PDF",
        uploadId: upload.id,
      },
      update: {
        grossWages: new Decimal(w.grossWages ?? 0),
        superAmount: new Decimal(w.superAmount ?? 0),
        totalHours:
          w.totalHours != null ? new Decimal(w.totalHours) : null,
        mForecast: w.mForecast != null ? new Decimal(w.mForecast) : null,
        revenueExGst:
          w.revenueExGst != null ? new Decimal(w.revenueExGst) : null,
        grossWagesExAdmin:
          w.grossWagesExAdmin != null
            ? new Decimal(w.grossWagesExAdmin)
            : null,
        grossWagesExAdminLeaveBackpay:
          w.grossWagesExAdminLeaveBackpay != null
            ? new Decimal(w.grossWagesExAdminLeaveBackpay)
            : null,
        grossWagesLessLeaveBackpay:
          w.grossWagesLessLeaveBackpay != null
            ? new Decimal(w.grossWagesLessLeaveBackpay)
            : null,
        wagesBarista:
          w.wagesBarista != null ? new Decimal(w.wagesBarista) : null,
        wagesChef: w.wagesChef != null ? new Decimal(w.wagesChef) : null,
        wagesFoh: w.wagesFoh != null ? new Decimal(w.wagesFoh) : null,
        wagesKp: w.wagesKp != null ? new Decimal(w.wagesKp) : null,
        wagesPastry:
          w.wagesPastry != null ? new Decimal(w.wagesPastry) : null,
        wagesAdmin:
          w.wagesAdmin != null ? new Decimal(w.wagesAdmin) : null,
        cogsActual:
          w.cogsActual != null ? new Decimal(w.cogsActual) : null,
        cogsPct: w.cogsPct != null ? new Decimal(w.cogsPct) : null,
        source: "PDF",
        uploadId: upload.id,
      },
    })
  }
  revalidatePath("/labour")
  return { uploadId: upload.id, weeks: valid.length }
}

/**
 * Legacy CSV-output PDF parser. Kept for backwards compatibility with
 * the existing labour upload form's textarea. New callers should use
 * parseLabourPdfRich + commitLabourMgePdf instead.
 */
export async function parseLabourPdf(params: {
  pdfBase64: string
  filename: string
}): Promise<{ csv: string; notes?: string }> {
  const { weeks } = await parseLabourPdfRich(params)
  const lines = ["venue,week_start,gross_wages,super,hours,m_forecast"]
  for (const w of weeks) {
    lines.push(
      [
        w.venueRaw || "",
        w.weekStartWed || "",
        w.grossWages ?? "",
        w.superAmount ?? "",
        w.totalHours ?? "",
        w.mForecast ?? "",
      ].join(",")
    )
  }
  return { csv: lines.join("\n"), notes: `Extracted from ${params.filename}` }
}
