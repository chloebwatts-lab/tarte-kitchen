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
 * For any DailySales rows on (date, venue) without a dishId, fuzzy-match them
 * against the active Dish catalogue and back-fill dishId. Idempotent.
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

  for (const sale of unmatchedSales) {
    const results = fuse.search(sale.menuItemName)
    if (
      results.length > 0 &&
      results[0].score !== undefined &&
      results[0].score < 0.3
    ) {
      await db.dailySales.update({
        where: { id: sale.id },
        data: { dishId: results[0].item.id },
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
