"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"
import { startOfTarteWeekUtc, weekStartWedIso } from "@/lib/dates"
import Decimal from "decimal.js"
import ExcelJS from "exceljs"

export interface ExtractedCogsWeek {
  venue: Venue | null
  venueRaw: string
  weekStartWed: string
  revenueExGst: number | null
  totalCogs: number | null
  cogsPct: number | null
  cogsFood: number | null
  cogsCoffee: number | null
  cogsConsumables: number | null
  cogsDrinks: number | null
  cogsPackaging: number | null
}

type CategoryKey =
  | "food"
  | "coffee"
  | "consumables"
  | "drinks"
  | "packaging"
  | "total"
  | "revenue"
  | "pct"

// All patterns are anchored to the start of the column-B cell so supplier
// rows like "Floozy Coffee" don't bleed into the category rollup.
const CATEGORY_LABELS: Record<CategoryKey, RegExp> = {
  food: /^\s*total\s+food\s+cost/i,
  coffee: /^\s*coffee\s*,?\s*tea/i,
  consumables: /^\s*consumable/i,
  drinks: /^\s*drink\s+cost/i,
  packaging: /^\s*packaging\s+material/i,
  total: /^\s*total\s+cogs/i,
  revenue: /^\s*revenue\s*$/i,
  pct: /%\s*of\s*revenue/i,
}

function cellValue(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>
    if ("result" in o) return o.result
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as { text: string }[]).map((r) => r.text).join("")
    }
  }
  return v
}

function toNum(v: unknown): number | null {
  const u = cellValue(v)
  if (u == null || u === "") return null
  const n = typeof u === "number" ? u : parseFloat(String(u))
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function toText(v: unknown): string {
  const u = cellValue(v)
  if (u == null) return ""
  return String(u).trim()
}

function matchVenue(raw: string): Venue | null {
  const s = raw.toUpperCase()
  if (s.includes("BURLEIGH") || s.includes("BAKERY")) return "BURLEIGH"
  if (s.includes("TEA")) return "TEA_GARDEN"
  if (s.includes("BEACH") || s.includes("CURRUMBIN")) return "BEACH_HOUSE"
  return null
}

// "we 9/4/24" → Date at UTC midnight (Tuesday). Tolerates typos like
// "we 23/4/224" (year string with stray digit) by taking last 2 digits.
function parseWeCell(text: string): Date | null {
  const m = text.match(/we\s+(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/i)
  if (!m) return null
  const day = parseInt(m[1], 10)
  const month = parseInt(m[2], 10) - 1
  const yRaw = m[3]
  const y2 = parseInt(yRaw.length > 2 ? yRaw.slice(-2) : yRaw, 10)
  const year = 2000 + y2
  const d = new Date(Date.UTC(year, month, day))
  return Number.isNaN(d.getTime()) ? null : d
}

/**
 * Parse the weekly COGS xlsx (Burleigh + Currumbin/Beach House layouts).
 *
 * Layout assumed (confirmed against both real files):
 * - Cell near top-left contains venue label ("Bakery Burleigh" /
 *   "BeachHouse Currumbin").
 * - Header row contains "we dd/m/yy" cells — one per week. "4 week
 *   Average" columns are ignored (they don't match the we-regex).
 * - Column B holds category labels; we match by regex for resilience
 *   against minor wording drift:
 *     Total food cost(s) / Coffee, tea & … / Consumables / Drink costs /
 *     Packaging material… / TOTAL COGS / Revenue / % of Revenue
 *
 * One ExtractedCogsWeek per data column. Weeks with no TOTAL COGS are
 * dropped (blank trailing columns).
 */
export async function parseCogsXlsx(params: {
  xlsxBase64: string
  filename: string
}): Promise<{ weeks: ExtractedCogsWeek[]; notes?: string }> {
  const wb = new ExcelJS.Workbook()
  const buf = Buffer.from(params.xlsxBase64, "base64")
  // exceljs types lag @types/node's Buffer<ArrayBuffer> generics — runtime
  // accepts either Buffer or raw ArrayBuffer, so cast.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buf as any)
  const ws = wb.worksheets[0]
  if (!ws) throw new Error("No worksheet in xlsx")

  let venueRaw = ""
  for (let r = 1; r <= Math.min(4, ws.rowCount); r++) {
    for (let c = 1; c <= 5; c++) {
      const t = toText(ws.getRow(r).getCell(c).value)
      if (t && /bakery|burleigh|beach|tea|currumbin/i.test(t)) {
        venueRaw = t
        break
      }
    }
    if (venueRaw) break
  }
  const venue = matchVenue(venueRaw)

  let headerRow = -1
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r)
    let hits = 0
    for (let c = 1; c <= ws.columnCount; c++) {
      if (/we\s+\d/i.test(toText(row.getCell(c).value))) {
        hits++
        if (hits >= 2) break
      }
    }
    if (hits >= 2) {
      headerRow = r
      break
    }
  }
  if (headerRow < 0) {
    throw new Error(
      "Couldn't find weekly header row (expected cells like 'we 9/4/24')"
    )
  }

  const colWeek: { col: number; weekEndTue: Date }[] = []
  const hRow = ws.getRow(headerRow)
  for (let c = 1; c <= ws.columnCount; c++) {
    const d = parseWeCell(toText(hRow.getCell(c).value))
    if (d) colWeek.push({ col: c, weekEndTue: d })
  }
  if (colWeek.length === 0) {
    throw new Error("No week-ending columns parsed from header row")
  }

  const labelRows: Record<CategoryKey, number> = {
    food: -1,
    coffee: -1,
    consumables: -1,
    drinks: -1,
    packaging: -1,
    total: -1,
    revenue: -1,
    pct: -1,
  }
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const label = toText(ws.getRow(r).getCell(2).value)
    if (!label) continue
    for (const key of Object.keys(CATEGORY_LABELS) as CategoryKey[]) {
      if (labelRows[key] === -1 && CATEGORY_LABELS[key].test(label)) {
        labelRows[key] = r
      }
    }
  }
  if (labelRows.total < 0 || labelRows.revenue < 0) {
    throw new Error("Missing TOTAL COGS or Revenue row in xlsx")
  }

  const getNum = (rowIdx: number, col: number): number | null => {
    if (rowIdx < 0) return null
    return toNum(ws.getRow(rowIdx).getCell(col).value)
  }

  const weeks: ExtractedCogsWeek[] = colWeek.map(({ col, weekEndTue }) => {
    const wed = new Date(weekEndTue)
    wed.setUTCDate(wed.getUTCDate() - 6)
    const weekStartWed = weekStartWedIso(wed)
    const pct = getNum(labelRows.pct, col)
    return {
      venue,
      venueRaw,
      weekStartWed,
      revenueExGst: getNum(labelRows.revenue, col),
      totalCogs: getNum(labelRows.total, col),
      // Sheet stores the % as a fraction (0.3254 → 32.54%). Normalise.
      cogsPct: pct == null ? null : pct < 1 ? Math.round(pct * 10000) / 100 : pct,
      cogsFood: getNum(labelRows.food, col),
      cogsCoffee: getNum(labelRows.coffee, col),
      cogsConsumables: getNum(labelRows.consumables, col),
      cogsDrinks: getNum(labelRows.drinks, col),
      cogsPackaging: getNum(labelRows.packaging, col),
    }
  })
  const nonEmpty = weeks.filter((w) => w.totalCogs != null)
  return {
    weeks: nonEmpty,
    notes: `Extracted ${nonEmpty.length} weeks from ${params.filename} (${venueRaw || "unknown venue"})`,
  }
}

// ----------------------------------------------------------------------
// Dashboard read
// ----------------------------------------------------------------------

export interface CogsWeekCell {
  weekStartWed: string
  revenueExGst: number | null
  totalCogs: number
  cogsPct: number | null
  cogsFood: number | null
  cogsCoffee: number | null
  cogsConsumables: number | null
  cogsDrinks: number | null
  cogsPackaging: number | null
}

export interface CogsDashboardData {
  weeks: string[] // ISO Wed-start ordered oldest→newest
  perVenue: {
    venue: Venue
    cells: Record<string, CogsWeekCell> // keyed by weekStartWed
  }[]
  lastUpload: {
    filename: string
    createdAt: string
    venue: Venue | null
    weekCount: number
  } | null
}

/**
 * Fetch the last N weeks of WeeklyCogs rows across every venue for the
 * COGS dashboard. Returns a pivoted shape the chart + table can both
 * read off directly.
 */
export async function getCogsDashboardData(params?: {
  weeks?: number
}): Promise<CogsDashboardData> {
  const weeksToFetch = params?.weeks ?? 12
  const now = new Date()
  const earliest = new Date(now)
  earliest.setUTCDate(earliest.getUTCDate() - 7 * (weeksToFetch + 1))

  const [rows, uploads] = await Promise.all([
    db.weeklyCogs.findMany({
      where: { weekStartWed: { gte: earliest } },
      orderBy: { weekStartWed: "asc" },
    }),
    db.cogsUpload.findMany({
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ])

  const weeksSet = new Set<string>()
  const byVenue = new Map<Venue, Map<string, CogsWeekCell>>()
  for (const v of SINGLE_VENUES) byVenue.set(v, new Map())
  for (const r of rows) {
    const iso = weekStartWedIso(r.weekStartWed)
    weeksSet.add(iso)
    const venueMap = byVenue.get(r.venue)
    if (!venueMap) continue
    venueMap.set(iso, {
      weekStartWed: iso,
      revenueExGst: r.revenueExGst != null ? Number(r.revenueExGst) : null,
      totalCogs: Number(r.totalCogs),
      cogsPct: r.cogsPct != null ? Number(r.cogsPct) : null,
      cogsFood: r.cogsFood != null ? Number(r.cogsFood) : null,
      cogsCoffee: r.cogsCoffee != null ? Number(r.cogsCoffee) : null,
      cogsConsumables:
        r.cogsConsumables != null ? Number(r.cogsConsumables) : null,
      cogsDrinks: r.cogsDrinks != null ? Number(r.cogsDrinks) : null,
      cogsPackaging:
        r.cogsPackaging != null ? Number(r.cogsPackaging) : null,
    })
  }
  const weeks = Array.from(weeksSet).sort().slice(-weeksToFetch)
  const perVenue = SINGLE_VENUES.map((venue) => ({
    venue,
    cells: Object.fromEntries(
      Array.from(byVenue.get(venue)?.entries() ?? []).filter(([iso]) =>
        weeks.includes(iso)
      )
    ) as Record<string, CogsWeekCell>,
  }))

  const lastUpload = uploads[0]
    ? {
        filename: uploads[0].filename,
        createdAt: uploads[0].createdAt.toISOString(),
        venue: null,
        weekCount: uploads[0].weekCount,
      }
    : null

  return { weeks, perVenue, lastUpload }
}

export async function commitCogsXlsx(params: {
  filename: string
  weeks: ExtractedCogsWeek[]
  uploadedBy?: string
}) {
  const valid = params.weeks.filter(
    (w): w is ExtractedCogsWeek & { venue: Venue; totalCogs: number } =>
      w.venue !== null && w.weekStartWed !== "" && w.totalCogs !== null
  )
  if (valid.length === 0) {
    throw new Error("No valid COGS weeks to commit")
  }
  const upload = await db.cogsUpload.create({
    data: {
      filename: params.filename,
      rawText: `xlsx: ${params.filename} (${valid.length} weeks, venue ${valid[0].venue})`,
      weekCount: valid.length,
      uploadedBy: params.uploadedBy ?? null,
    },
  })
  for (const w of valid) {
    const wk = startOfTarteWeekUtc(new Date(w.weekStartWed))
    const payload = {
      revenueExGst:
        w.revenueExGst != null ? new Decimal(w.revenueExGst) : null,
      totalCogs: new Decimal(w.totalCogs),
      cogsPct: w.cogsPct != null ? new Decimal(w.cogsPct) : null,
      cogsFood: w.cogsFood != null ? new Decimal(w.cogsFood) : null,
      cogsCoffee: w.cogsCoffee != null ? new Decimal(w.cogsCoffee) : null,
      cogsConsumables:
        w.cogsConsumables != null ? new Decimal(w.cogsConsumables) : null,
      cogsDrinks: w.cogsDrinks != null ? new Decimal(w.cogsDrinks) : null,
      cogsPackaging:
        w.cogsPackaging != null ? new Decimal(w.cogsPackaging) : null,
      source: "XLSX",
      uploadId: upload.id,
    }
    await db.weeklyCogs.upsert({
      where: { venue_weekStartWed: { venue: w.venue, weekStartWed: wk } },
      create: { venue: w.venue, weekStartWed: wk, ...payload },
      update: payload,
    })
  }
  revalidatePath("/labour")
  return { uploadId: upload.id, weeks: valid.length }
}
