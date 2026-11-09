/**
 * Shared post-ingest enrichment for daily sales rows.
 *
 * Both the API-based cron (/api/cron/sync-sales) and the Gmail-based cron
 * (/api/cron/sync-lightspeed-reports) call these to turn raw DailySales rows
 * into dish-matched, COGS-aware records.
 */

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma/client"
import Decimal from "decimal.js"
import Fuse from "fuse.js"
import {
  expandDishUsage,
  type UsageAccumulator,
  type UsagePreparation,
} from "./theoretical-usage"

/**
 * Till names that the fuzzy matcher cannot reach on its own, mapped to the
 * recipe card they cost against. Keys are lower-cased, trimmed till names.
 * The card must exist for the venue (or BOTH) or the alias is ignored.
 */
export const TILL_NAME_ALIASES: Record<string, string> = {
  "chicken sandwich": "Chicken Miso Sandwich",
  pancakes: "Creme Brulee Pancakes",
  "steak & frites": "Steak and Frites",
  "eggs your way": "Poached Eggs on Toast",
  "grilled barramundi": "Mediterranean Grilled Barramundi",
  "smash burger": "Beef Burger",
  "b&e": "B & E Roll",
  "pea fritters": "Pea & Halloumi Fritters Plated",
  "sourdough & hot honey": "Hot Honey Sourdough",
  "wombok chicken salad": "Wombok Miso Chicken Salad",
  "chopped wombok chicken salad": "Wombok Miso Chicken Salad",
  "blt sandwich": "BLT",
  yogurt: "Whipped Yoghurt & Poached Pear",
  "cheese bagel + soup": "Cheese Bagel & Tomato Soup",
}

/**
 * Till names that must never be linked to a card. "Espresso" is a coffee;
 * the fuzzy matcher was costing it as the Maca Espresso cocktail.
 */
export const NEVER_MATCH_TILL_NAMES = new Set(["espresso", "espresso - r", "espresso - tg", "double espresso"])

export function normaliseTillName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ")
}

type DishRef = { id: string; name: string }

/**
 * Pick the card for one till name: alias first, then fuzzy, never for the
 * deny list. `fuzzy` returns the best fuzzy match or null. Pure.
 */
export function resolveDishForTillName(
  tillName: string,
  dishes: DishRef[],
  fuzzy: (name: string) => DishRef | null
): DishRef | null {
  const key = normaliseTillName(tillName)
  if (NEVER_MATCH_TILL_NAMES.has(key)) return null
  const alias = TILL_NAME_ALIASES[key]
  if (alias) {
    const hit = dishes.find((d) => d.name.toLowerCase() === alias.toLowerCase())
    if (hit) return hit
  }
  return fuzzy(tillName)
}

/**
 * For any DailySales rows on (date, venue) without a dishId, match them
 * against the active Dish catalogue (alias table first, then fuzzy) and
 * back-fill dishId. Idempotent.
 */
export async function matchSalesToDishes(date: Date, venue: Venue) {
  const unmatchedSales = await db.dailySales.findMany({
    where: { date, venue, dishId: null },
  })

  if (unmatchedSales.length === 0) return

  const dishes = await db.dish.findMany({
    where: {
      isActive: true,
      venue: { in: [venue, "BOTH"] },
    },
    select: { id: true, name: true },
  })

  if (dishes.length === 0) return

  const fuse = new Fuse(dishes, {
    keys: ["name"],
    threshold: 0.3,
    includeScore: true,
  })
  const fuzzy = (name: string): DishRef | null => {
    const results = fuse.search(name)
    return results.length > 0 && results[0].score !== undefined && results[0].score < 0.3 ? results[0].item : null
  }

  for (const sale of unmatchedSales) {
    const dish = resolveDishForTillName(sale.menuItemName, dishes, fuzzy)
    if (dish) {
      await db.dailySales.update({
        where: { id: sale.id },
        data: { dishId: dish.id },
      })
    }
  }
}

/**
 * EMAIL-sourced DailySales rows arrive with quantity only (the Lightspeed
 * EOD PDF has no per-item revenue). For rows that matched a dish, estimate
 * revenue as menu price × quantity so revenue-based reads (menu mix, top
 * sellers by $) work. Estimates are identifiable via `source = EMAIL`;
 * API-sourced rows are never touched. Idempotent.
 */
export async function estimateEmailItemRevenue(date: Date, venue: Venue) {
  const rows = await db.dailySales.findMany({
    where: { date, venue, source: "EMAIL", dishId: { not: null } },
    include: { dish: { select: { sellingPrice: true } } },
  })

  for (const row of rows) {
    if (!row.dish?.sellingPrice) continue
    const inc = new Decimal(row.dish.sellingPrice).mul(row.quantitySold)
    if (inc.equals(new Decimal(row.revenue))) continue
    await db.dailySales.update({
      where: { id: row.id },
      data: { revenue: inc, revenueExGst: inc.div(1.1) },
    })
  }
}

/**
 * Sum the cached `Dish.totalCost * quantitySold` across dish-matched sales
 * for the given (date, venue). Returns null if nothing matched.
 */
export async function calculateTheoreticalCogs(
  date: Date,
  venue: Venue
): Promise<Decimal | null> {
  const matchedSales = await db.dailySales.findMany({
    where: { date, venue, dishId: { not: null } },
    include: {
      dish: { select: { totalCost: true } },
    },
  })

  if (matchedSales.length === 0) return null

  let total = new Decimal(0)
  for (const sale of matchedSales) {
    if (sale.dish) {
      total = total.plus(new Decimal(sale.dish.totalCost).mul(sale.quantitySold))
    }
  }

  return total
}

/**
 * Expand dish-matched sales into theoretical ingredient-level usage,
 * upserting into TheoreticalUsage.
 *
 * Each dish sold takes its SHARE of a preparation batch (300 g of an
 * 11,250 g batch is 300/11250 of the batch's cream), quantities land in
 * the ingredient's base unit (g / ml / ea) and sub-preparations are
 * followed. The old version charged a whole batch per dish, which put
 * Beach House thickened cream at 25x what was bought. Pure logic lives in
 * ./theoretical-usage.ts.
 */
export async function calculateTheoreticalUsage(date: Date, venue: Venue) {
  const ingredientSelect = {
    id: true,
    baseUnitType: true,
    gramsPerUnit: true,
  } as const

  const matchedSales = await db.dailySales.findMany({
    where: { date, venue, dishId: { not: null } },
    include: {
      dish: {
        include: {
          components: { include: { ingredient: { select: ingredientSelect } } },
        },
      },
    },
  })

  if (matchedSales.length === 0) return

  // Every preparation with its items, once, so sub-prep chains of any depth
  // resolve in memory instead of a nested include per dish.
  const prepRows = await db.preparation.findMany({
    select: {
      id: true,
      yieldQuantity: true,
      yieldUnit: true,
      yieldWeightGrams: true,
      items: { include: { ingredient: { select: ingredientSelect } } },
    },
  })
  const preps = new Map<string, UsagePreparation>(prepRows.map((p) => [p.id, p]))

  const usageMap: UsageAccumulator = new Map()
  for (const sale of matchedSales) {
    if (!sale.dish) continue
    expandDishUsage(sale.dish.components, sale.quantitySold, preps, usageMap)
  }

  for (const [ingredientId, data] of usageMap) {
    await db.theoreticalUsage.upsert({
      where: {
        date_venue_ingredientId: { date, venue, ingredientId },
      },
      update: {
        theoreticalQty: data.qty,
        theoreticalCost: data.cost,
        unit: data.unit,
      },
      create: {
        date,
        venue,
        ingredientId,
        theoreticalQty: data.qty,
        theoreticalCost: data.cost,
        unit: data.unit,
      },
    })
  }

  // Ingredients that no longer appear (recipe changed, or a stale row from
  // the old over-counting) must not linger at their old value.
  await db.theoreticalUsage.deleteMany({
    where: { date, venue, ingredientId: { notIn: [...usageMap.keys()] } },
  })
}
