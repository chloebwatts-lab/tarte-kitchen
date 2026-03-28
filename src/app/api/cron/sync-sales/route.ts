export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getActiveConnection } from "@/lib/lightspeed/token"
import { lightspeedClient, groupSalesByItem } from "@/lib/lightspeed/client"
import { getValidAccessToken } from "@/lib/lightspeed/token"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"
import Fuse from "fuse.js"

export async function GET(request: Request) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveConnection()
  if (!connection) {
    return Response.json({ error: "Lightspeed not connected" }, { status: 400 })
  }

  const locations = (connection.businessLocations as Array<{
    id: string
    name: string
    venue: string
  }>) ?? []

  if (locations.length === 0) {
    return Response.json({ error: "No locations configured" }, { status: 400 })
  }

  // Yesterday in AEST (UTC+10)
  const now = new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(now.getTime() + aestOffset)
  const yesterday = new Date(aestNow)
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split("T")[0]
  const dateObj = new Date(dateStr)

  const results: Array<{ venue: string; itemCount: number }> = []

  for (const location of locations) {
    try {
      const salesData = await lightspeedClient.getSales(location.id, dateStr)
      const grouped = groupSalesByItem(salesData.items ?? [])

      const venue = location.venue as Venue

      // Upsert each item
      for (const item of grouped) {
        const revenue = new Decimal(item.total)
        const revenueExGst = revenue.div(1.1)

        await db.dailySales.upsert({
          where: {
            date_venue_menuItemName: {
              date: dateObj,
              venue,
              menuItemName: item.name,
            },
          },
          update: {
            quantitySold: item.qty,
            revenue,
            revenueExGst,
            voids: item.voids,
            comps: item.comps,
            menuItemId: item.id ?? null,
          },
          create: {
            date: dateObj,
            venue,
            menuItemName: item.name,
            menuItemId: item.id ?? null,
            quantitySold: item.qty,
            revenue,
            revenueExGst,
            voids: item.voids,
            comps: item.comps,
          },
        })
      }

      // Match sales to TK dishes
      await matchSalesToDishes(dateObj, venue)

      // Calculate theoretical COGS
      const theoreticalCogs = await calculateTheoreticalCogs(dateObj, venue)

      // Upsert summary
      const totalRevenue = grouped.reduce((sum, i) => sum + i.total, 0)
      const totalRevenueExGst = new Decimal(totalRevenue).div(1.1)
      const totalVoids = grouped.reduce((sum, i) => sum + i.voids, 0)
      const totalComps = grouped.reduce((sum, i) => sum + i.comps, 0)
      const totalCovers = salesData.covers ?? 0
      const avgSpend = totalCovers > 0 ? totalRevenueExGst.div(totalCovers) : new Decimal(0)

      await db.dailySalesSummary.upsert({
        where: { date_venue: { date: dateObj, venue } },
        update: {
          totalRevenue: new Decimal(totalRevenue),
          totalRevenueExGst,
          totalCovers,
          averageSpend: avgSpend,
          totalVoids,
          totalComps,
          theoreticalCogs,
        },
        create: {
          date: dateObj,
          venue,
          totalRevenue: new Decimal(totalRevenue),
          totalRevenueExGst,
          totalCovers,
          averageSpend: avgSpend,
          totalVoids,
          totalComps,
          theoreticalCogs,
        },
      })

      // Calculate theoretical ingredient usage
      await calculateTheoreticalUsage(dateObj, venue)

      results.push({ venue: location.venue, itemCount: grouped.length })
    } catch (err) {
      console.error(`Error syncing sales for ${location.name}:`, err)
      results.push({ venue: location.venue, itemCount: -1 })
    }
  }

  return Response.json({ success: true, date: dateStr, results })
}

async function matchSalesToDishes(date: Date, venue: Venue) {
  // Get unmatched sales for this date/venue
  const unmatchedSales = await db.dailySales.findMany({
    where: { date, venue, dishId: null },
  })

  if (unmatchedSales.length === 0) return

  // Get all active dishes for this venue
  const dishes = await db.dish.findMany({
    where: {
      isActive: true,
      venue: { in: [venue, "BOTH"] },
    },
    select: { id: true, name: true },
  })

  if (dishes.length === 0) return

  // Fuzzy match using Fuse.js
  const fuse = new Fuse(dishes, {
    keys: ["name"],
    threshold: 0.3, // Fairly strict matching
    includeScore: true,
  })

  for (const sale of unmatchedSales) {
    const results = fuse.search(sale.menuItemName)
    if (results.length > 0 && results[0].score !== undefined && results[0].score < 0.3) {
      await db.dailySales.update({
        where: { id: sale.id },
        data: { dishId: results[0].item.id },
      })
    }
  }
}

async function calculateTheoreticalCogs(
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

async function calculateTheoreticalUsage(date: Date, venue: Venue) {
  // Get matched sales with dish components
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

  // Aggregate theoretical usage per ingredient
  const usageMap = new Map<string, { qty: Decimal; cost: Decimal; unit: string }>()

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

      // Also trace through preparations to get ingredient-level usage
      if (comp.preparationId && comp.preparation) {
        for (const prepItem of comp.preparation.items) {
          if (prepItem.ingredientId && prepItem.ingredient) {
            const key = prepItem.ingredientId
            const existing = usageMap.get(key) ?? {
              qty: new Decimal(0),
              cost: new Decimal(0),
              unit: prepItem.unit,
            }
            // Scale by how much of the prep batch is used
            // This is approximate — uses the ratio from dish component
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

  // Upsert theoretical usage records
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
