"use server"

import { db } from "@/lib/db"

export interface PortionGuideComponent {
  item: string
  isPrep: boolean
  quantity: number
  unit: string
}

export interface PortionGuideDish {
  dishId: string
  name: string
  menuCategory: string
  /** Total of the g/ml lines, what the plate should weigh before eaches. */
  platedGrams: number
  /** Lines measured in ea/serve, counted separately from the gram total. */
  countLines: number
  components: PortionGuideComponent[]
}

const GRAM_UNITS = new Set(["g", "ml"])

/**
 * Every plating weight on the menu, straight off the recipe cards, so the
 * pass reads the same numbers the food cost is built on.
 *
 * `venue` is the kitchen venue. Tea Garden shares the Beach House menu, and
 * a dish marked BOTH shows at either site.
 */
export async function getPortionGuide(
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
): Promise<PortionGuideDish[]> {
  const dishVenue = venue === "BURLEIGH" ? "BURLEIGH" : "BEACH_HOUSE"

  const dishes = await db.dish.findMany({
    where: { isActive: true, venue: { in: [dishVenue, "BOTH"] } },
    select: {
      id: true,
      name: true,
      menuCategory: true,
      components: {
        select: {
          quantity: true,
          unit: true,
          ingredient: { select: { name: true } },
          preparation: { select: { name: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { name: "asc" },
  })

  const out: PortionGuideDish[] = []
  for (const d of dishes) {
    const components: PortionGuideComponent[] = []
    let platedGrams = 0
    let countLines = 0

    for (const c of d.components) {
      const name = c.preparation?.name ?? c.ingredient?.name
      // A component with neither side linked is a broken card, not a portion.
      if (!name) continue
      const quantity = Number(c.quantity)
      if (quantity <= 0) continue

      const unit = c.unit.toLowerCase().trim()
      if (GRAM_UNITS.has(unit)) platedGrams += quantity
      else countLines += 1

      components.push({
        item: name,
        isPrep: Boolean(c.preparation),
        quantity,
        unit: c.unit,
      })
    }

    // Nothing costed means nothing to weigh.
    if (components.length === 0) continue

    out.push({
      dishId: d.id,
      name: d.name,
      menuCategory: d.menuCategory,
      platedGrams: Math.round(platedGrams),
      countLines,
      components,
    })
  }
  return out
}
