"use server"

/**
 * Par-level suggestions + bulk persistence.
 *
 * The suggestion engine reads the last 4 weeks of TheoreticalUsage per
 * (ingredient, venue), computes a weekly average, applies a cover
 * multiplier based on the supplier's delivery cadence, then rounds up to
 * the nearest whole pack size. The chef accepts/edits in /par-levels;
 * we never auto-save.
 *
 * Cover multipliers:
 *   - Supplier delivers ≥3 days/wk → 0.7× weekly usage (re-order fast)
 *   - Supplier delivers 1-2 days/wk → 1.5× weekly usage (covers between deliveries)
 *   - Supplier delivery days unknown / 0 → 1.5× as a safe default
 */

import { db } from "@/lib/db"
import { Venue, ParSource } from "@/generated/prisma"
import { revalidatePath } from "next/cache"

// Local conversion to base units (g / ml / ea). Mirrors the helper in
// orders.ts so par suggestions and order math use identical arithmetic.
// `baseUnitsPerOne` is how many base units one `unit` contains
// (Ingredient.baseUnitsPerPurchase ÷ purchaseQuantity) — REQUIRED for
// pack-named units ("bag", "punnet", "btl"): without it a 25,000 g flour
// bag was treated as 1 g and the suggested par inflated ~25,000×.
function toBaseUnits(
  qty: number,
  unit: string,
  baseType: "WEIGHT" | "VOLUME" | "COUNT",
  baseUnitsPerOne?: number | null
): number {
  const u = unit.toLowerCase()
  if (baseType === "WEIGHT") {
    if (u === "kg" || u === "kgs") return qty * 1000
    if (u === "g" || u === "gm" || u === "gms" || u === "gram" || u === "grams") return qty
  } else if (baseType === "VOLUME") {
    if (u === "l" || u === "lt" || u === "ltr" || u === "litre" || u === "litres") return qty * 1000
    if (u === "ml") return qty
  } else {
    if (u === "ea" || u === "each") return qty
  }
  if (baseUnitsPerOne && baseUnitsPerOne > 0) return qty * baseUnitsPerOne
  return qty
}

const FOUR_WEEKS_DAYS = 28
const LIVE_VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

export type ParSuggestionRow = {
  ingredientId: string
  ingredientName: string
  category: string
  baseUnit: string // 'g' / 'ml' / 'ea' from purchaseUnit normalisation
  supplierId: string | null
  supplierName: string | null
  /** Pack size in purchaseUnit (e.g. 12.5 for a 12.5kg bag). */
  packQuantity: number
  packUnit: string
  /** Weekly TheoreticalUsage average, per venue, in purchaseUnit. */
  weeklyUsage: Record<Venue, number>
  /** Suggested par per venue, already pack-aware (whole packs only), in purchaseUnit. */
  suggestedPar: Record<Venue, number>
  /** Current par per venue (from IngredientPar if set, else legacy Ingredient.parLevel for BURLEIGH only). */
  currentPar: Record<Venue, number | null>
  currentParSource: Record<Venue, ParSource | "LEGACY" | null>
  coverMultiplier: number
}

function coverMultiplierFor(deliveryDays: number[] | null | undefined): number {
  if (!deliveryDays || deliveryDays.length === 0) return 1.5
  if (deliveryDays.length >= 3) return 0.7
  return 1.5
}

/**
 * Round a quantity up to the nearest whole pack. Always returns ≥ 1 pack if
 * raw qty > 0, so an ingredient with any usage gets at least one pack of par.
 */
function roundUpToPack(rawQty: number, packQty: number): number {
  if (rawQty <= 0) return 0
  if (packQty <= 0) return rawQty
  const packs = Math.ceil(rawQty / packQty)
  return Math.max(1, packs) * packQty
}

export async function getParSuggestions(): Promise<ParSuggestionRow[]> {
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - FOUR_WEEKS_DAYS)

  // Pull ingredients with a supplier set — only those are orderable.
  const ingredients = await db.ingredient.findMany({
    where: { supplierId: { not: null } },
    include: {
      supplier: { select: { id: true, name: true, deliveryDays: true } },
      pars: true,
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  })

  if (ingredients.length === 0) return []

  // 4-week usage per (venue, ingredient). theoreticalQty is stored in base units
  // (grams / ml / each). Convert back to purchase units below.
  const usageRows = await db.theoreticalUsage.groupBy({
    by: ["venue", "ingredientId"],
    where: { date: { gte: cutoff }, venue: { in: LIVE_VENUES } },
    _sum: { theoreticalQty: true },
  })
  // Index for fast lookup
  const usageByKey = new Map<string, number>()
  for (const r of usageRows) {
    const k = `${r.venue}|${r.ingredientId}`
    usageByKey.set(k, Number(r._sum.theoreticalQty ?? 0))
  }

  const rows: ParSuggestionRow[] = []
  for (const ing of ingredients) {
    const baseType = ing.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
    const baseUnit = baseType === "WEIGHT" ? "g" : baseType === "VOLUME" ? "ml" : "ea"

    // Pack size in purchaseUnit (e.g. flour: 12.5 kg per bag)
    const packQty = Number(ing.purchaseQuantity)
    const packUnit = ing.purchaseUnit

    // Convert pack size to base units to compare with usage.
    const perOne =
      Number(ing.baseUnitsPerPurchase) > 0 && packQty > 0
        ? Number(ing.baseUnitsPerPurchase) / packQty
        : null
    const packBase = toBaseUnits(packQty, packUnit, baseType, perOne)

    const deliveryDays = (ing.supplier?.deliveryDays as number[] | undefined) ?? []
    const cover = coverMultiplierFor(deliveryDays)

    const weeklyUsage: Record<Venue, number> = { BURLEIGH: 0, BEACH_HOUSE: 0, TEA_GARDEN: 0, BOTH: 0 }
    const suggestedPar: Record<Venue, number> = { BURLEIGH: 0, BEACH_HOUSE: 0, TEA_GARDEN: 0, BOTH: 0 }
    const currentPar: Record<Venue, number | null> = { BURLEIGH: null, BEACH_HOUSE: null, TEA_GARDEN: null, BOTH: null }
    const currentParSource: Record<Venue, ParSource | "LEGACY" | null> = { BURLEIGH: null, BEACH_HOUSE: null, TEA_GARDEN: null, BOTH: null }

    for (const v of LIVE_VENUES) {
      const usageBase4wk = usageByKey.get(`${v}|${ing.id}`) ?? 0
      // Convert 4-wk usage in base units → weekly in purchaseUnit.
      const usageBaseWk = usageBase4wk / 4
      const usagePackQty = packBase > 0 ? usageBaseWk / packBase * packQty : usageBaseWk
      weeklyUsage[v] = Math.round(usagePackQty * 100) / 100

      const rawTarget = usagePackQty * cover
      suggestedPar[v] = Math.round(roundUpToPack(rawTarget, packQty) * 100) / 100
    }

    // Apply existing per-venue pars
    for (const p of ing.pars) {
      currentPar[p.venue] = Number(p.parLevel)
      currentParSource[p.venue] = p.source
    }
    // Legacy fallback: if no per-venue par set anywhere AND legacy parLevel set,
    // expose it as BURLEIGH (matches how we backfilled).
    if (ing.parLevel != null && ing.pars.length === 0) {
      currentPar.BURLEIGH = Number(ing.parLevel)
      currentParSource.BURLEIGH = "LEGACY"
    }

    rows.push({
      ingredientId: ing.id,
      ingredientName: ing.name,
      category: ing.category as string,
      baseUnit,
      supplierId: ing.supplierId,
      supplierName: ing.supplier?.name ?? null,
      packQuantity: packQty,
      packUnit,
      weeklyUsage,
      suggestedPar,
      currentPar,
      currentParSource,
      coverMultiplier: cover,
    })
  }

  return rows
}

/**
 * Recompute auto-pars from invoice purchase history.
 *
 * For every ingredient with an invoice line in the last `windowWeeks` (default 8):
 *   - Group matched invoice lines by venue
 *   - Sum total quantity bought, divide by windowWeeks → weekly average qty
 *   - Round up to whole packs (so we always order in whole packs)
 *
 * Stores the result on `IngredientPar` with source=AUTO_INVOICE.
 *
 * **Never overwrites** a MANUAL row — chef tuning wins. AUTO_INVOICE rows
 * are refreshed each call so the par tracks reality as buying habits shift.
 */
export async function refreshAutoParsFromInvoices(opts?: {
  windowWeeks?: number
  /** When true, refresh even rows whose source is MANUAL. Off by default. */
  overwriteManual?: boolean
}): Promise<{
  ingredientsProcessed: number
  parsUpserted: number
  skippedManual: number
}> {
  const windowWeeks = opts?.windowWeeks ?? 8
  const overwriteManual = opts?.overwriteManual ?? false
  const cutoff = new Date()
  cutoff.setUTCDate(cutoff.getUTCDate() - windowWeeks * 7)

  // Pull invoice line items in window with matched ingredients and a venue.
  // Group by (ingredientId, venue) summing quantity in the line's own unit.
  // We then convert to base units against the ingredient's purchase unit
  // before applying pack rounding.
  const rows = await db.invoiceLineItem.findMany({
    where: {
      ingredientId: { not: null },
      quantity: { not: null },
      invoice: {
        invoiceDate: { gte: cutoff },
        status: { notIn: ["ERROR", "STATEMENT", "DUPLICATE"] },
        venue: { not: null },
      },
    },
    select: {
      ingredientId: true,
      quantity: true,
      unit: true,
      invoice: { select: { venue: true } },
    },
  })

  // Aggregate
  type Key = string // `${venue}|${ingredientId}`
  const totalBaseByKey = new Map<Key, number>()
  const ingredientIds = new Set<string>()
  for (const r of rows) {
    if (!r.ingredientId || !r.invoice.venue || r.quantity == null) continue
    ingredientIds.add(r.ingredientId)
    totalBaseByKey.set(
      `${r.invoice.venue}|${r.ingredientId}`,
      (totalBaseByKey.get(`${r.invoice.venue}|${r.ingredientId}`) ?? 0) +
        Number(r.quantity)
    )
  }
  if (ingredientIds.size === 0)
    return { ingredientsProcessed: 0, parsUpserted: 0, skippedManual: 0 }

  // Fetch the matched ingredients (need pack info + existing par rows)
  const ingredients = await db.ingredient.findMany({
    where: { id: { in: Array.from(ingredientIds) } },
    select: {
      id: true,
      purchaseQuantity: true,
      purchaseUnit: true,
      baseUnitType: true,
      pars: { select: { venue: true, source: true } },
    },
  })

  let parsUpserted = 0
  let skippedManual = 0
  for (const ing of ingredients) {
    const packQty = Number(ing.purchaseQuantity)
    const baseType = ing.baseUnitType as "WEIGHT" | "VOLUME" | "COUNT"
    const manualVenues = new Set(
      ing.pars
        .filter((p) => p.source === "MANUAL")
        .map((p) => p.venue as Venue)
    )

    for (const venue of LIVE_VENUES) {
      const key: Key = `${venue}|${ing.id}`
      const totalQty = totalBaseByKey.get(key)
      if (!totalQty || totalQty <= 0) continue

      // Weekly avg in the invoice line's unit. Invoice lines for this
      // ingredient should be using the same unit family as the ingredient's
      // purchaseUnit (kg / L / each), so the values are directly comparable.
      const weeklyQty = totalQty / windowWeeks
      // Round up to whole packs
      const parQty = packQty > 0
        ? Math.max(1, Math.ceil(weeklyQty / packQty)) * packQty
        : weeklyQty

      if (manualVenues.has(venue) && !overwriteManual) {
        skippedManual++
        continue
      }
      // Suppress baseType-unused lint
      void baseType

      await db.ingredientPar.upsert({
        where: { ingredientId_venue: { ingredientId: ing.id, venue } },
        create: {
          ingredientId: ing.id,
          venue,
          parLevel: Math.round(parQty * 1000) / 1000,
          parUnit: ing.purchaseUnit,
          source: "AUTO_INVOICE",
          notes: `Auto from invoices: ${weeklyQty.toFixed(2)} ${ing.purchaseUnit}/wk avg over ${windowWeeks} wk`,
        },
        update: {
          parLevel: Math.round(parQty * 1000) / 1000,
          parUnit: ing.purchaseUnit,
          source: "AUTO_INVOICE",
          notes: `Auto from invoices: ${weeklyQty.toFixed(2)} ${ing.purchaseUnit}/wk avg over ${windowWeeks} wk`,
        },
      })
      parsUpserted++
    }
  }
  revalidatePath("/par-levels")
  revalidatePath("/orders")
  return {
    ingredientsProcessed: ingredients.length,
    parsUpserted,
    skippedManual,
  }
}

export async function bulkUpsertPars(
  items: Array<{
    ingredientId: string
    venue: Venue
    parLevel: number
    parUnit: string
    source?: ParSource
    notes?: string | null
  }>,
  updatedBy?: string
): Promise<{ saved: number }> {
  let saved = 0
  for (const it of items) {
    if (it.parLevel < 0) continue
    if (it.parLevel === 0) {
      // Treat zero as "delete the par"
      await db.ingredientPar
        .delete({ where: { ingredientId_venue: { ingredientId: it.ingredientId, venue: it.venue } } })
        .catch(() => undefined)
      saved++
      continue
    }
    await db.ingredientPar.upsert({
      where: { ingredientId_venue: { ingredientId: it.ingredientId, venue: it.venue } },
      create: {
        ingredientId: it.ingredientId,
        venue: it.venue,
        parLevel: it.parLevel,
        parUnit: it.parUnit,
        source: it.source ?? "MANUAL",
        notes: it.notes ?? null,
        updatedBy: updatedBy ?? null,
      },
      update: {
        parLevel: it.parLevel,
        parUnit: it.parUnit,
        source: it.source ?? "MANUAL",
        notes: it.notes ?? null,
        updatedBy: updatedBy ?? null,
      },
    })
    saved++
  }
  revalidatePath("/par-levels")
  revalidatePath("/orders")
  return { saved }
}
