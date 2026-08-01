"use server"

import { db } from "@/lib/db"

export interface ServesGuideDishUse {
  dishName: string
  grams: number
  isActive: boolean
}

export interface ServesGuideEntry {
  preparationId: string
  name: string
  category: string
  batchWeightGrams: number
  /** Grams of this prep in one full serve. */
  portionGrams: number
  /**
   * Where the portion came from:
   * - "recipe": the prep card's own yield is stored in serves
   * - "dish":   largest per-serve gram usage across dishes that plate it
   */
  portionSource: "recipe" | "dish"
  /** Full serves in one complete batch, floored. */
  batchServes: number
  dishUses: ServesGuideDishUse[]
}

const GRAM_UNITS: Record<string, number> = {
  g: 1,
  kg: 1000,
  // Preps store yieldWeightGrams assuming ~1 g/ml, so treat volume the same
  ml: 1,
  l: 1000,
}

function isServesUnit(u: string) {
  const s = u.toLowerCase().trim()
  return s === "serve" || s === "serves" || s === "portion" || s === "portions"
}

/**
 * Everything needed to turn "weight written on the tub" into "full serves".
 * Only preps with a derivable portion are returned — a prep whose yield is
 * in serves uses its own card, otherwise we fall back to the biggest gram
 * quantity a dish plates per serve (the "full serve" dish, not a garnish use).
 */
export async function getServesGuide(): Promise<ServesGuideEntry[]> {
  const preps = await db.preparation.findMany({
    select: {
      id: true,
      name: true,
      category: true,
      yieldQuantity: true,
      yieldUnit: true,
      yieldWeightGrams: true,
      dishComponents: {
        select: {
          quantity: true,
          unit: true,
          dish: { select: { name: true, isActive: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  })

  const entries: ServesGuideEntry[] = []
  for (const p of preps) {
    const batchWeightGrams = Number(p.yieldWeightGrams)
    if (batchWeightGrams <= 0) continue

    const dishUses: ServesGuideDishUse[] = []
    for (const c of p.dishComponents) {
      const factor = GRAM_UNITS[c.unit.toLowerCase().trim()]
      if (factor === undefined) continue
      const grams = Number(c.quantity) * factor
      if (grams <= 0) continue
      dishUses.push({ dishName: c.dish.name, grams, isActive: c.dish.isActive })
    }
    // Biggest active-dish portion first; that's the headline "full serve"
    dishUses.sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || b.grams - a.grams
    )

    const yieldQty = Number(p.yieldQuantity)
    const recipePortion =
      isServesUnit(p.yieldUnit) && yieldQty > 0
        ? batchWeightGrams / yieldQty
        : null

    // Single-serve recipes (cocktails, made-to-order plates) aren't stored in
    // buckets — skip unless a dish plates them by weight.
    if (recipePortion !== null && yieldQty <= 1 && dishUses.length === 0) continue

    const dishPortion = dishUses.find((d) => d.isActive)?.grams ?? dishUses[0]?.grams
    const portionGrams = recipePortion ?? dishPortion
    if (!portionGrams || portionGrams <= 0) continue

    entries.push({
      preparationId: p.id,
      name: p.name,
      category: p.category,
      batchWeightGrams,
      portionGrams,
      portionSource: recipePortion !== null ? "recipe" : "dish",
      batchServes: Math.floor(batchWeightGrams / portionGrams),
      dishUses,
    })
  }
  return entries
}
