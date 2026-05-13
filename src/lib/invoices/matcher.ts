import { db } from "@/lib/db"
import Fuse from "fuse.js"

interface MatchResult {
  ingredientId: string
  mappingId: string | null
  matched: true
}

interface NoMatch {
  matched: false
}

/**
 * Maps invoice line descriptions to TK ingredients. Strategy is a
 * cascade — exact-mapped first, then fuzzy-mapped, then fuzzy against
 * supplier's own ingredient subset, finally fuzzy against the WHOLE
 * ingredient master list. The all-ingredients fallback is what catches
 * cases where the supplier row has no linked ingredients (e.g. Pixel
 * Bakehouse, Provedores, Fermex) but the items themselves exist in the
 * costing list under a different supplier or none at all.
 *
 * Match quality bar gets stricter as we widen the net — same-supplier
 * fuzzy is 0.4 (loose), cross-supplier fuzzy is 0.28 (tight) because a
 * generic name like "Olive Oil" matches dozens of ingredients and we
 * only want a hit when it's nearly identical.
 */
export async function matchLineItem(
  invoiceDescription: string,
  supplierId: string
): Promise<MatchResult | NoMatch> {
  // 1. Check exact mapping
  const mapping = await db.supplierItemMapping.findUnique({
    where: {
      supplierId_invoiceDescription: {
        supplierId,
        invoiceDescription,
      },
    },
  })

  if (mapping) {
    return {
      matched: true,
      ingredientId: mapping.ingredientId,
      mappingId: mapping.id,
    }
  }

  // 2. Case-insensitive mapping match
  const fuzzyMapping = await db.supplierItemMapping.findFirst({
    where: {
      supplierId,
      invoiceDescription: { equals: invoiceDescription, mode: "insensitive" },
    },
  })

  if (fuzzyMapping) {
    return {
      matched: true,
      ingredientId: fuzzyMapping.ingredientId,
      mappingId: fuzzyMapping.id,
    }
  }

  // 3. Fuzzy match against this supplier's ingredients first (loose threshold)
  const supplierIngredients = await db.ingredient.findMany({
    where: { supplierId },
    select: { id: true, name: true, supplierProductCode: true },
  })

  if (supplierIngredients.length > 0) {
    const fuse = new Fuse(supplierIngredients, {
      keys: ["name", "supplierProductCode"],
      threshold: 0.4,
      includeScore: true,
    })
    const results = fuse.search(invoiceDescription)
    const top = results[0]
    if (top && top.score !== undefined && top.score < 0.4) {
      const newMapping = await db.supplierItemMapping.create({
        data: {
          supplierId,
          ingredientId: top.item.id,
          invoiceDescription,
        },
      })
      return {
        matched: true,
        ingredientId: top.item.id,
        mappingId: newMapping.id,
      }
    }
  }

  // 4. Cross-supplier fuzzy — search the whole ingredient master list.
  // Tighter threshold (0.28) so we don't match "Olive Oil Garlic" to
  // every olive oil variant in the system; we want a clear winner.
  const normalised = normaliseDescription(invoiceDescription)
  const allIngredients = await db.ingredient.findMany({
    select: { id: true, name: true, supplierProductCode: true },
  })
  if (allIngredients.length === 0) return { matched: false }

  const fuse = new Fuse(allIngredients, {
    keys: ["name", "supplierProductCode"],
    threshold: 0.28,
    includeScore: true,
    distance: 60,
  })
  const results = fuse.search(normalised)
  const top = results[0]
  if (top && top.score !== undefined && top.score < 0.28) {
    // Auto-create the supplier mapping so the next invoice from this
    // supplier matches instantly without going through fuzzy again.
    const newMapping = await db.supplierItemMapping.create({
      data: {
        supplierId,
        ingredientId: top.item.id,
        invoiceDescription,
      },
    })
    return {
      matched: true,
      ingredientId: top.item.id,
      mappingId: newMapping.id,
    }
  }

  return { matched: false }
}

/**
 * Trims the noise that supplier descriptions add and that fuzzy match
 * weights heavily — pack sizes ("12.5kg", "ea", "carton"), product
 * codes embedded in the name, and parenthetical notes. What's left is
 * the actual food name we want to match.
 */
function normaliseDescription(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*(kg|g|l|ml|ea|each|pkt|btl|ctn|bag|box|carton|tin|can|jar|tray|case|tub|pkg)\b/g, " ")
    .replace(/\b\d{4,}\b/g, " ") // long numeric codes
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export interface PriceChangeResult {
  changed: boolean
  previousPrice: number
  currentPrice: number
  changeAmount: number
  changePercent: number
}

export async function detectPriceChange(
  ingredientId: string,
  newUnitPrice: number
): Promise<PriceChangeResult> {
  const ingredient = await db.ingredient.findUnique({
    where: { id: ingredientId },
    select: { purchasePrice: true },
  })

  if (!ingredient) {
    return {
      changed: false,
      previousPrice: newUnitPrice,
      currentPrice: newUnitPrice,
      changeAmount: 0,
      changePercent: 0,
    }
  }

  const previousPrice = Number(ingredient.purchasePrice)
  const diff = newUnitPrice - previousPrice
  const pctChange = previousPrice > 0 ? (diff / previousPrice) * 100 : 0

  return {
    changed: Math.abs(diff) >= 0.01,
    previousPrice,
    currentPrice: newUnitPrice,
    changeAmount: diff,
    changePercent: pctChange,
  }
}
