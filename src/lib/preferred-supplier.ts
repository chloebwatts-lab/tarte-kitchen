/**
 * "Where to order it": pure ranking logic for the managers' lookup.
 *
 * The approved supplier forms (scripts/order-forms.json, seeded into
 * ApprovedSupplierItem) already carry the decision: `active` = the source
 * we chose, `active: false` = on that supplier's book but we buy it
 * elsewhere. This module turns a search result (a handful of rows across
 * suppliers) into something a manager can read in one glance: the rows to
 * order, the rows to avoid, and for each avoided row which active row
 * replaces it and how much dearer it is per unit.
 *
 * Bidfood prices on the forms are GROSS; Tarte gets a volume rebate, so
 * comparisons use the net figure. No database here, so it is unit-tested.
 */

export type FormRow = {
  id: string
  supplier: string
  name: string
  packSize: string | null
  packPrice: number
  unitPrice: number | null
  unit: string | null
  category: string | null
  notes: string | null
  active: boolean
}

export type RankedRow = FormRow & {
  role: "order" | "avoid"
  /** Pack price after the supplier's rebate, if any. */
  netPackPrice: number
  /** Per-unit price after rebate, null when the form has no unit price. */
  netUnitPrice: number | null
  /** Percent the supplier knocks off at rebate time (0 for most). */
  rebatePct: number
  /** For an avoided row: the active row that replaces it, when one is on the forms. */
  useInstead: { id: string; supplier: string; name: string; packSize: string | null } | null
  /** Percent dearer per unit than `useInstead` (negative = actually cheaper). Null when units differ or a price is missing. */
  vsPreferredPct: number | null
}

/** Volume rebates by supplier name, matching scripts/order-forms.json. */
export const REBATE_PCT: Record<string, number> = { Bidfood: 4 }

export function rebateFor(supplier: string): number {
  return REBATE_PCT[supplier] ?? 0
}

export function netPrice(gross: number, rebatePct: number): number {
  return Math.round(gross * (1 - rebatePct / 100) * 10000) / 10000
}

const STOP = new Set([
  "the", "and", "of", "x", "with", "per", "a", "in", "ctn", "pack", "pkt", "bag",
  "each", "ea", "tub", "carton", "case", "box", "style", "kg", "g", "l", "ml",
  "lt", "gr", "units", "unit", "case", "piece", "pieces",
])

/** Words that identify the product: no brands in parentheses, no pack numbers. */
export function productTokens(name: string): Set<string> {
  const noBrand = name.replace(/\([^)]*\)/g, " ")
  const words = noBrand
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !STOP.has(w) && !/^\d/.test(w))
  return new Set(words)
}

/** Category and descriptor words that many unrelated products share. */
const GENERIC = new Set([
  "cheese", "milk", "oil", "cream", "cold", "hot", "uht", "shredded", "sliced", "frozen",
  "dried", "ground", "whole", "raw", "plain", "iqf", "powder", "paste", "sauce", "juice",
  "seeds", "seed", "cups", "lids", "bags", "white", "black", "brown", "pure", "mix",
  "fresh", "organic", "premium", "barista", "flakes", "pieces", "halves", "kernels",
])

function unitKey(unit: string | null): string {
  return (unit ?? "").trim().toLowerCase()
}

/**
 * Pair an avoided row with the active row it should be replaced by: same
 * unit, and enough shared product words that it is plainly the same thing
 * (two shared words, or half of the smaller name). "Peanut Butter" must not
 * pair with "Butter Unsalted" on the single word "butter".
 */
export function bestReplacement(row: FormRow, candidates: FormRow[]): FormRow | null {
  const mine = productTokens(row.name)
  if (mine.size === 0) return null
  let best: FormRow | null = null
  let bestScore = 0
  for (const c of candidates) {
    if (!c.active || c.id === row.id) continue
    if (unitKey(c.unit) !== unitKey(row.unit)) continue
    const theirs = productTokens(c.name)
    let shared = 0
    for (const t of mine) if (theirs.has(t)) shared++
    // Two shared product words with at least one that names the product
    // ("sugar caster", "olive oil"), or both names are the one same word
    // ("Oregano"). Shared category words alone ("cheese shredded", "milk
    // uht", "cups cold") do not make it the same product.
    let specific = 0
    for (const t of mine) if (theirs.has(t) && !GENERIC.has(t)) specific++
    const qualifies = (shared >= 2 && specific >= 1) || (shared === 1 && mine.size === 1 && theirs.size === 1)
    if (!qualifies) continue
    const jaccard = shared / (mine.size + theirs.size - shared)
    // Tie-break on the cheaper per-unit price so the recommendation is the
    // best of the matching active rows, not the first one seen.
    const price = c.unitPrice == null ? Number.POSITIVE_INFINITY : netPrice(c.unitPrice, rebateFor(c.supplier))
    const bestPrice = best?.unitPrice == null ? Number.POSITIVE_INFINITY : netPrice(best.unitPrice, rebateFor(best.supplier))
    if (jaccard > bestScore || (jaccard === bestScore && price < bestPrice)) {
      best = c
      bestScore = jaccard
    }
  }
  return best
}

export function rankRows(rows: FormRow[]): RankedRow[] {
  const ranked: RankedRow[] = rows.map((r) => {
    const rebatePct = rebateFor(r.supplier)
    const netUnitPrice = r.unitPrice == null ? null : netPrice(r.unitPrice, rebatePct)
    let useInstead: RankedRow["useInstead"] = null
    let vsPreferredPct: number | null = null
    if (!r.active) {
      const rep = bestReplacement(r, rows)
      if (rep) {
        useInstead = { id: rep.id, supplier: rep.supplier, name: rep.name, packSize: rep.packSize }
        const repNet = rep.unitPrice == null ? null : netPrice(rep.unitPrice, rebateFor(rep.supplier))
        if (netUnitPrice != null && repNet != null && repNet > 0) {
          vsPreferredPct = Math.round(((netUnitPrice - repNet) / repNet) * 1000) / 10
        }
      }
    }
    return {
      ...r,
      role: r.active ? "order" : "avoid",
      netPackPrice: netPrice(r.packPrice, rebatePct),
      netUnitPrice,
      rebatePct,
      useInstead,
      vsPreferredPct,
    }
  })
  ranked.sort((a, b) => {
    if (a.role !== b.role) return a.role === "order" ? -1 : 1
    const ap = a.netUnitPrice ?? Number.POSITIVE_INFINITY
    const bp = b.netUnitPrice ?? Number.POSITIVE_INFINITY
    if (unitKey(a.unit) === unitKey(b.unit) && ap !== bp) return ap - bp
    return a.name.localeCompare(b.name)
  })
  return ranked
}

/** Every word of the query must appear in the name (any order, any case). */
export function matchesQuery(name: string, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const hay = name.toLowerCase()
  return words.length > 0 && words.every((w) => hay.includes(w))
}
