export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getValidGmailAccessToken } from "@/lib/gmail/token"
import { getSpreadsheetData } from "@/lib/sheets/client"
import type { WasteReason, Venue } from "@/generated/prisma/client"
import Decimal from "decimal.js"

const SHEET_ID = process.env.WASTAGE_SHEET_ID

// ─── Tab → Venue mapping ───────────────────────────────────────────────────
// Note: the Currumbin sheet currently covers both Beach House and Tea Garden;
// default it to BEACH_HOUSE until separate tabs exist.
const TAB_VENUE: Record<string, Venue> = {
  "BOH - Burleigh":        "BURLEIGH",
  "BOH - Currumbin":       "BEACH_HOUSE",
  "BOH - Beach House":     "BEACH_HOUSE",
  "BOH - Tea Garden":      "TEA_GARDEN",
  "Pastry - Prep":         "BOTH",
  "FOH - Pastry Counter":  "BOTH",
}

// ─── Reason string → enum ─────────────────────────────────────────────────
function parseReason(raw: string | null): WasteReason {
  if (!raw) return "OTHER"
  const map: Record<string, WasteReason> = {
    overproduction:   "OVERPRODUCTION",
    spoilage:         "SPOILAGE",
    expired:          "EXPIRED",
    dropped:          "DROPPED",
    "staff meal":     "STAFF_MEAL",
    staffmeal:        "STAFF_MEAL",
    "customer return":"CUSTOMER_RETURN",
    customerreturn:   "CUSTOMER_RETURN",
    "quality issue":  "QUALITY_ISSUE",
    qualityissue:     "QUALITY_ISSUE",
    other:            "OTHER",
  }
  return map[raw.toLowerCase().trim()] ?? "OTHER"
}

// ─── Parse date from spreadsheet cell (handles DD/MM/YYYY and serial) ─────
function parseDate(raw: string | null): Date | null {
  if (!raw) return null

  // Google Sheets serial date (days since 30 Dec 1899)
  const num = Number(raw)
  if (!isNaN(num) && num > 1000) {
    const ms = (num - 25569) * 86400 * 1000
    const d = new Date(ms)
    if (!isNaN(d.getTime())) return d
  }

  // DD/MM/YYYY or YYYY-MM-DD
  const ddmm = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (ddmm) return new Date(`${ddmm[3]}-${ddmm[2].padStart(2,"0")}-${ddmm[1].padStart(2,"0")}`)

  const iso = new Date(raw)
  if (!isNaN(iso.getTime())) return iso

  return null
}

// ─── Skip section headers and title rows ──────────────────────────────────
function isDataRow(row: (string | null)[]): boolean {
  const item = row[1]?.trim() ?? ""
  if (!item || item.startsWith("—") || item.startsWith("Date") || item.startsWith("Item")) return false
  if (item.startsWith("TARTE") || item.startsWith("Week") || item.toLowerCase().includes("sign-off")) return false
  return true
}

// ─── Estimate cost for an item given qty + unit ────────────────────────────
async function estimateCost(
  ingredientId: string | null,
  dishId: string | null,
  prepId: string | null,
  quantity: number,
  unit: string
): Promise<number> {
  try {
    if (ingredientId) {
      const ing = await db.ingredient.findUnique({ where: { id: ingredientId } })
      if (!ing) return 0
      const purchasePrice = Number(ing.purchasePrice)
      const baseUnits = Number(ing.baseUnitsPerPurchase)
      const waste = Number(ing.wastePercentage) / 100
      const costPerBase = purchasePrice / (baseUnits * (1 - waste))
      // Convert unit to base units for cost calculation
      const unitLower = unit.toLowerCase()
      let multiplier = quantity
      if (ing.baseUnitType === "WEIGHT") {
        if (unitLower === "kg") multiplier = quantity * 1000
        else if (unitLower === "g") multiplier = quantity
        else multiplier = quantity
      } else if (ing.baseUnitType === "VOLUME") {
        if (unitLower === "l") multiplier = quantity * 1000
        else if (unitLower === "ml") multiplier = quantity
        else multiplier = quantity
      }
      return new Decimal(costPerBase).times(multiplier).toDecimalPlaces(2).toNumber()
    }
    if (dishId) {
      const dish = await db.dish.findUnique({ where: { id: dishId } })
      if (!dish) return 0
      return new Decimal(String(dish.totalCost)).times(quantity).toDecimalPlaces(2).toNumber()
    }
    if (prepId) {
      const prep = await db.preparation.findUnique({ where: { id: prepId } })
      if (!prep) return 0
      const unitLower = unit.toLowerCase()
      if (unitLower === "g" || unitLower === "kg") {
        const grams = unitLower === "kg" ? quantity * 1000 : quantity
        return new Decimal(String(prep.costPerGram)).times(grams).toDecimalPlaces(2).toNumber()
      }
      return new Decimal(String(prep.costPerServe)).times(quantity).toDecimalPlaces(2).toNumber()
    }
  } catch {
    // silently return 0 on any cost calc error
  }
  return 0
}

// ─── Fuzzy item lookup ─────────────────────────────────────────────────────
interface MatchResult {
  ingredientId: string | null
  dishId: string | null
  prepId: string | null
}

async function matchItem(name: string): Promise<MatchResult> {
  const clean = name.trim().toLowerCase()

  // Try exact match first across all three tables in parallel
  const [ingredients, dishes, preps] = await Promise.all([
    db.ingredient.findMany({
      where: { name: { equals: name, mode: "insensitive" } },
      take: 1,
    }),
    db.dish.findMany({
      where: { name: { equals: name, mode: "insensitive" } },
      take: 1,
    }),
    db.preparation.findMany({
      where: { name: { equals: name, mode: "insensitive" } },
      take: 1,
    }),
  ])

  if (ingredients.length > 0) return { ingredientId: ingredients[0].id, dishId: null, prepId: null }
  if (dishes.length > 0) return { ingredientId: null, dishId: dishes[0].id, prepId: null }
  if (preps.length > 0) return { ingredientId: null, dishId: null, prepId: preps[0].id }

  // Fuzzy: contains match
  const [fi, fd, fp] = await Promise.all([
    db.ingredient.findMany({ where: { name: { contains: clean, mode: "insensitive" } }, take: 1 }),
    db.dish.findMany({ where: { name: { contains: clean, mode: "insensitive" } }, take: 1 }),
    db.preparation.findMany({ where: { name: { contains: clean, mode: "insensitive" } }, take: 1 }),
  ])

  if (fi.length > 0) return { ingredientId: fi[0].id, dishId: null, prepId: null }
  if (fd.length > 0) return { ingredientId: null, dishId: fd[0].id, prepId: null }
  if (fp.length > 0) return { ingredientId: null, dishId: null, prepId: fp[0].id }

  return { ingredientId: null, dishId: null, prepId: null }
}

// ─── Main handler ──────────────────────────────────────────────────────────
export async function GET(request: Request) {
  // Auth check
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  if (!SHEET_ID) {
    return Response.json({ error: "WASTAGE_SHEET_ID not configured" }, { status: 500 })
  }

  const results = {
    tabs: [] as {
      tab: string
      venue: Venue | null
      rowsProcessed: number
      rowsInserted: number
      rowsSkipped: number
      unmatched: string[]
    }[],
    totalInserted: 0,
    errors: [] as string[],
  }

  try {
    const accessToken = await getValidGmailAccessToken()
    const sheets = await getSpreadsheetData(SHEET_ID, accessToken)

    for (const sheet of sheets) {
      const venue = TAB_VENUE[sheet.sheetName] ?? null
      if (!venue) continue  // Skip unrecognised tabs

      const tabResult = {
        tab: sheet.sheetName,
        venue,
        rowsProcessed: 0,
        rowsInserted: 0,
        rowsSkipped: 0,
        unmatched: [] as string[],
      }

      for (const row of sheet.rows) {
        const v = row.values

        // Columns: Date(0), Item(1), Qty(2), Unit(3), Reason(4), Notes(5)
        // Pastry tab has 7 cols: Date(0), Item(1), BatchesMade(2), BatchesWasted(3), Unit(4), Reason(5), Notes(6)
        const isPastry = sheet.sheetName === "Pastry - Prep"

        const dateRaw   = v[0] ?? null
        const itemName  = v[1]?.trim() ?? ""
        const qtyRaw    = isPastry ? (v[3] ?? v[2]) : v[2]   // batches wasted or qty
        const unitRaw   = isPastry ? v[4] : v[3]
        const reasonRaw = isPastry ? v[5] : v[4]
        const notesRaw  = isPastry ? v[6] : v[5]

        if (!isDataRow(v)) continue
        tabResult.rowsProcessed++

        // Skip if no date or no qty
        const date = parseDate(dateRaw)
        const qty = qtyRaw ? parseFloat(qtyRaw) : null
        if (!date || !qty || qty <= 0) {
          tabResult.rowsSkipped++
          continue
        }

        const unit   = unitRaw?.trim() || "ea"
        const reason = parseReason(reasonRaw)
        const notes  = notesRaw?.trim() || null

        // Deduplicate: skip if this entry already exists
        const exists = await db.wasteEntry.findFirst({
          where: {
            date,
            venue,
            itemName: { equals: itemName, mode: "insensitive" },
            quantity: qty,
          },
        })
        if (exists) {
          tabResult.rowsSkipped++
          continue
        }

        // Match item to DB record
        const match = await matchItem(itemName)
        if (!match.ingredientId && !match.dishId && !match.prepId) {
          tabResult.unmatched.push(itemName)
        }

        const estimatedCost = await estimateCost(
          match.ingredientId,
          match.dishId,
          match.prepId,
          qty,
          unit
        )

        await db.wasteEntry.create({
          data: {
            date,
            venue,
            itemName,
            quantity: qty,
            unit,
            reason,
            estimatedCost,
            notes,
            recordedBy: "sheet-sync",
            ...(match.ingredientId ? { ingredientId: match.ingredientId } : {}),
            ...(match.dishId ? { dishId: match.dishId } : {}),
          },
        })

        tabResult.rowsInserted++
        results.totalInserted++
      }

      results.tabs.push(tabResult)
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    results.errors.push(msg)
    console.error("[sync-wastage]", msg)
  }

  console.log("[sync-wastage]", JSON.stringify(results))
  return Response.json(results)
}
