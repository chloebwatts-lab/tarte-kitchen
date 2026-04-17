export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { getActiveConnection } from "@/lib/lightspeed/token"
import { lightspeedClient, groupSalesByItem } from "@/lib/lightspeed/client"
import { Venue } from "@/generated/prisma"
import Decimal from "decimal.js"
import {
  matchSalesToDishes,
  calculateTheoreticalCogs,
  calculateTheoreticalUsage,
} from "@/lib/sales/enrich"
import { normalizeVenueSlug } from "@/lib/venues"

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

  const results: Array<{
    venue: string
    itemCount: number
    skipped?: boolean
    reason?: string
  }> = []

  for (const location of locations) {
    try {
      const venue = (normalizeVenueSlug(location.venue) ??
        (location.venue as Venue)) as Venue

      // Source-of-truth rule: if a Lightspeed EOD email has already landed
      // for this date/venue, the email numbers are authoritative — don't
      // overwrite them via the API fallback.
      const existingEmailSummary = await db.dailySalesSummary.findUnique({
        where: { date_venue: { date: dateObj, venue } },
        select: { source: true },
      })
      if (existingEmailSummary?.source === "EMAIL") {
        results.push({
          venue: location.venue,
          itemCount: 0,
          skipped: true,
          reason: "EMAIL source present",
        })
        continue
      }

      const salesData = await lightspeedClient.getSales(location.id, dateStr)
      const grouped = groupSalesByItem(salesData.items ?? [])

      for (const item of grouped) {
        const revenue = new Decimal(item.total)
        const revenueExGst = revenue.div(1.1)

        // If an EMAIL-sourced row already exists for this item, skip.
        const existingRow = await db.dailySales.findUnique({
          where: {
            date_venue_menuItemName: {
              date: dateObj,
              venue,
              menuItemName: item.name,
            },
          },
          select: { source: true },
        })
        if (existingRow?.source === "EMAIL") continue

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
            source: "API",
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
            source: "API",
          },
        })
      }

      await matchSalesToDishes(dateObj, venue)

      const theoreticalCogs = await calculateTheoreticalCogs(dateObj, venue)

      const totalRevenue = grouped.reduce((sum, i) => sum + i.total, 0)
      const totalRevenueExGst = new Decimal(totalRevenue).div(1.1)
      const totalVoids = grouped.reduce((sum, i) => sum + i.voids, 0)
      const totalComps = grouped.reduce((sum, i) => sum + i.comps, 0)
      const totalCovers = salesData.covers ?? 0
      const avgSpend =
        totalCovers > 0 ? totalRevenueExGst.div(totalCovers) : new Decimal(0)

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
          source: "API",
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
          source: "API",
        },
      })

      await calculateTheoreticalUsage(dateObj, venue)

      results.push({ venue: location.venue, itemCount: grouped.length })
    } catch (err) {
      console.error(`Error syncing sales for ${location.name}:`, err)
      results.push({ venue: location.venue, itemCount: -1 })
    }
  }

  return Response.json({ success: true, date: dateStr, results })
}
