/**
 * Shared post-ingest enrichment for daily sales rows.
 *
 * Both the API-based cron (/api/cron/sync-sales) and the Gmail-based cron
 * (/api/cron/sync-lightspeed-reports) call these to turn raw DailySales rows
 * into dish-matched, COGS-aware records.
 */

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"
import Fuse from "fuse.js"

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
 * upserting into TheoreticalUsage. Follows preparations recursively (one
 * level — matches prior behaviour).
 */
export async function calculateTheoreticalUsage(date: Date, venue: Venue) {
  const matchedSales = await db.dailySales.findMany({
    where: { date, venue, dishId: { not: null } },
    include: {
      dish: {
        include: {
          components: {
            include: {
              ingredient: {
                select: {
                  id: true,
                  purchasePrice: true,
                  baseUnitsPerPurchase: true,
                  wastePercentage: true,
                },
              },
              preparation: {
                include: {
                  items: {
                    include: {
                      ingredient: {
                        select: {
                          id: true,
                          purchasePrice: true,
                          baseUnitsPerPurchase: true,
                          wastePercentage: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  })

  const usageMap = new Map<
    string,
    { qty: Decimal; cost: Decimal; unit: string }
  >()

  for (const sale of matchedSales) {
    if (!sale.dish) continue
    const multiplier = sale.quantitySold

    for (const comp of sale.dish.components) {
      if (comp.ingredientId && comp.ingredient) {
        const key = comp.ingredientId
        const existing = usageMap.get(key) ?? {
          qty: new Decimal(0),
          cost: new Decimal(0),
          unit: comp.unit,
        }
        existing.qty = existing.qty.plus(new Decimal(comp.quantity).mul(multiplier))
        existing.cost = existing.cost.plus(new Decimal(comp.lineCost).mul(multiplier))
        usageMap.set(key, existing)
      }

      if (comp.preparationId && comp.preparation) {
        for (const prepItem of comp.preparation.items) {
          if (prepItem.ingredientId && prepItem.ingredient) {
            const key = prepItem.ingredientId
            const existing = usageMap.get(key) ?? {
              qty: new Decimal(0),
              cost: new Decimal(0),
              unit: prepItem.unit,
            }
            existing.qty = existing.qty.plus(
              new Decimal(prepItem.quantity).mul(multiplier)
            )
            existing.cost = existing.cost.plus(
              new Decimal(prepItem.lineCost).mul(multiplier)
            )
            usageMap.set(key, existing)
          }
        }
      }
    }
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
}
