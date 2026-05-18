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

// Local conversion: kg→g and L→ml, everything else passes through. Mirrors
// the helper in orders.ts so par suggestions and order math use identical
// arithmetic.
function toBaseUnits(qty: number, unit: string, baseType: "WEIGHT" | "VOLUME" | "COUNT"): number {
  const u = unit.toLowerCase()
  if (baseType === "WEIGHT") return u === "kg" ? qty * 1000 : qty
  if (baseType === "VOLUME") return u === "l" ? qty * 1000 : qty
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
    const packBase = toBaseUnits(packQty, packUnit, baseType)

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
