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

// ─── Cross-supplier ingredient cache ───────────────────────────────
// The "all ingredients" lookup is the same for every line in a cron
// run. Fetching it once per call (1000+ lines × 500 ingredients each)
// is what OOMd the app during the rematch backfill. We cache the
// snapshot + the built Fuse index for 60s — long enough to cover the
// longest cron run, short enough that fresh ingredients added in the
// UI show up reliably.

interface AllIngredientCache {
  list: Array<{
    id: string
    name: string
    supplierId: string | null
    supplierProductCode: string | null
  }>
  fuse: Fuse<{
    id: string
    name: string
    supplierId: string | null
    supplierProductCode: string | null
  }>
  expiresAt: number
}

let allIngredientCache: AllIngredientCache | null = null

async function getAllIngredientsFuse(): Promise<AllIngredientCache> {
  const now = Date.now()
  if (allIngredientCache && allIngredientCache.expiresAt > now) {
    return allIngredientCache
  }
  const list = await db.ingredient.findMany({
    select: { id: true, name: true, supplierId: true, supplierProductCode: true },
  })
  const fuse = new Fuse(list, {
    keys: ["name", "supplierProductCode"],
    threshold: 0.28,
    includeScore: true,
    distance: 60,
  })
  allIngredientCache = { list, fuse, expiresAt: now + 60_000 }
  return allIngredientCache
}

/** Expose for tests / hot-reload safety. */
export function clearMatcherCache() {
  allIngredientCache = null
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
  // 1. Exact mapping (skip ignored ones — user rejected them)
  const mapping = await db.supplierItemMapping.findUnique({
    where: {
      supplierId_invoiceDescription: {
        supplierId,
        invoiceDescription,
      },
    },
  })

  if (mapping && !mapping.ignored) {
    return {
      matched: true,
      ingredientId: mapping.ingredientId,
      mappingId: mapping.id,
    }
  }

  // 2. Case-insensitive mapping match (also skip ignored)
  const fuzzyMapping = await db.supplierItemMapping.findFirst({
    where: {
      supplierId,
      invoiceDescription: { equals: invoiceDescription, mode: "insensitive" },
      ignored: false,
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

  // 4. Cross-supplier token-overlap match (with stemming).
  // For each ingredient, check whether ALL words in its name appear as
  // tokens in the (normalised, stemmed) description. Catches:
  //   "ACAI MIX SCOOPABLE AMAZONIA 10kg" → "Acai"
  //   "BAGUETTE Semi Sourdough 480g"     → "Baguette"
  //   "TOMATO MEDIUM KG"                 → "Tomatoes"     (stem strips plurals)
  //   "CHIVE bunch"                      → "Chives"
  // Multi-word ingredients win over single-word via specificity rank.
  //
  // Brand guard: parenthetical brand tags in ingredient names
  // ("Milk Bun (BreadTop)") indicate brand-specific products. We only
  // match those when the brand token also appears in the description
  // OR when the invoice's supplier matches the ingredient's supplier.
  const normalised = normaliseDescription(invoiceDescription)
  const descStems = new Set(
    normalised.split(/\s+/).filter((t) => t.length >= 3).map(stem)
  )
  if (descStems.size === 0) return { matched: false }

  const { list, fuse } = await getAllIngredientsFuse()
  if (list.length === 0) return { matched: false }

  let bestTokenMatch: { id: string; name: string; specificity: number } | null = null
  for (const ing of list) {
    const ingNameLower = ing.name.toLowerCase()
    // Tokens for matching (length ≥3, stemmed).
    const ingTokens = ingNameLower
      .replace(/[()]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 3)
      .map(stem)
    if (ingTokens.length === 0) continue
    // Every ingredient-name token (incl. parenthetical brand) must be
    // present in the description. "Milk Bun (BreadTop)" needs all of
    // milk + bun + breadtop in the description to match.
    const allPresent = ingTokens.every((t) => descStems.has(t))
    if (!allPresent) continue
    // Cross-supplier guard: if the ingredient has a supplier set and
    // it's NOT the current invoice's supplier, only allow the match if
    // the ingredient name doesn't carry a brand tag (parenthetical).
    // This stops "Milk Bun (BreadTop)" from matching Pixel Bread
    // invoices when there's no BreadTop branding on the description.
    if (
      ing.supplierId &&
      ing.supplierId !== supplierId &&
      /\([^)]+\)/.test(ing.name)
    ) {
      continue
    }
    // Specificity = sum of token lengths. "Rice vinegar" (12) beats
    // "Rice" (4) when description contains both.
    const specificity = ingTokens.reduce((s, t) => s + t.length, 0)
    if (!bestTokenMatch || specificity > bestTokenMatch.specificity) {
      bestTokenMatch = { id: ing.id, name: ing.name, specificity }
    }
  }

  if (bestTokenMatch) {
    const mappingId = await safeCreateMapping(
      supplierId,
      invoiceDescription,
      bestTokenMatch.id
    )
    return {
      matched: true,
      ingredientId: bestTokenMatch.id,
      mappingId,
    }
  }

  // 5. Cross-supplier fuzzy as a final fallback (tight threshold —
  // typo recovery, not generic matching).
  const results = fuse.search(normalised)
  const top = results[0]
  if (top && top.score !== undefined && top.score < 0.28) {
    const mappingId = await safeCreateMapping(
      supplierId,
      invoiceDescription,
      top.item.id
    )
    return {
      matched: true,
      ingredientId: top.item.id,
      mappingId,
    }
  }

  return { matched: false }
}

/**
 * Try to create a supplier mapping; if one already exists (e.g. an
 * ignored mapping the user rejected), return null so the line still
 * gets matched but we don't fight the existing record. The line's
 * `ingredientId` is set on the line item itself, so this is purely
 * about the future auto-match short-circuit in step 1.
 */
async function safeCreateMapping(
  supplierId: string,
  invoiceDescription: string,
  ingredientId: string
): Promise<string | null> {
  try {
    const created = await db.supplierItemMapping.create({
      data: { supplierId, ingredientId, invoiceDescription },
    })
    return created.id
  } catch {
    return null
  }
}

/**
 * Cheap English stemmer for the token matcher — collapses common
 * singular/plural variants without pulling in a real Porter stemmer.
 * Solves things like supplier "TOMATO" vs ingredient "Tomatoes",
 * "CHIVE" vs "Chives", "PEAR" vs "Pears", "POTATO" vs "Potatoes".
 *
 * Conservative — only modifies words of length ≥4 so we don't mangle
 * short ones (e.g. "tea" stays "tea").
 */
function stem(t: string): string {
  if (t.length < 4) return t
  // -ies → -y (cherries → cherry)
  if (t.endsWith("ies") && t.length >= 5) return t.slice(0, -3) + "y"
  // -oes → -o (tomatoes → tomato, potatoes → potato; also catches mangoes)
  if (t.endsWith("oes") && t.length >= 5) return t.slice(0, -2)
  // -ves → -f (loaves → loaf, leaves → leaf)
  if (t.endsWith("ves") && t.length >= 5) return t.slice(0, -3) + "f"
  // -es after s/x/z/ch/sh (boxes → box, dishes → dish, churches → church)
  if (t.endsWith("es") && /(s|x|z|ch|sh)es$/.test(t)) return t.slice(0, -2)
  // -s plural (pears → pear, almonds → almond, chives → chive). Skip
  // -ss (kiss), -us (lupus), and short tokens to avoid mangling.
  if (t.endsWith("s") && t.length >= 4 && !t.endsWith("ss") && !t.endsWith("us"))
    return t.slice(0, -1)
  return t
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
