import { db } from "@/lib/db"
import Decimal from "decimal.js"
import type { Venue } from "@/generated/prisma/client"
import { normalizeVenueSlug } from "@/lib/venues"
import {
  matchSalesToDishes,
  calculateTheoreticalCogs,
  calculateTheoreticalUsage,
} from "@/lib/sales/enrich"
import { searchClosedOrders, listPayments, aggregateOrders, aggregatePayments } from "./client"
import { getSquareConnection, getSquareAccessToken, squareLocations } from "./token"

export interface SquareSyncResult {
  venue: string
  date: string
  items: number
  orders: number
  totalIncGst: number
  fees: number
  cardTakings: number
  summaryWritten: boolean
  skipped?: string
}

/** AEST dates ending today inclusive, oldest first. */
export function aestDates(days: number, now = new Date()): string[] {
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  const out: string[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const d = new Date(aest)
    d.setUTCDate(d.getUTCDate() - offset)
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/**
 * Pull closed orders + payments from Square for each mapped location and
 * write item-level DailySales (source API) plus the day's summary. Rules:
 *  - Item rows always refresh (the Square daily email has no items, so the
 *    API is the only item source for Square venues).
 *  - The summary is written only while no EMAIL row exists for that day:
 *    once Square's own daily summary email lands (~00:30 AEST) that figure
 *    is final and the intraday API number must not replace it. Fees and
 *    card takings are still filled in on an EMAIL row when they are empty.
 */
export async function syncSquareSales(dates: string[]): Promise<SquareSyncResult[]> {
  const conn = await getSquareConnection()
  if (!conn) throw new Error("Square not connected")
  const token = await getSquareAccessToken()
  const locations = squareLocations(conn)
  const results: SquareSyncResult[] = []

  for (const dateStr of dates) {
    const dateObj = new Date(dateStr)
    for (const loc of locations) {
      const venue = normalizeVenueSlug(loc.venue) as Venue | null
      if (!venue || venue === "BOTH") {
        results.push({ venue: loc.venue, date: dateStr, items: 0, orders: 0, totalIncGst: 0, fees: 0, cardTakings: 0, summaryWritten: false, skipped: "unmapped location" })
        continue
      }
      const [orders, payments] = await Promise.all([
        searchClosedOrders(token, loc.id, dateStr),
        listPayments(token, loc.id, dateStr),
      ])
      const agg = aggregateOrders(orders)
      const pay = aggregatePayments(payments)

      // Replace the day's API item rows for this venue in one go so items
      // that vanished from Square (voided, renamed) do not linger.
      await db.dailySales.deleteMany({ where: { date: dateObj, venue, source: "API" } })
      for (const item of agg.items) {
        const existing = await db.dailySales.findUnique({
          where: { date_venue_menuItemName: { date: dateObj, venue, menuItemName: item.name } },
          select: { source: true },
        })
        if (existing?.source === "EMAIL") continue
        await db.dailySales.create({
          data: {
            date: dateObj,
            venue,
            menuItemName: item.name,
            menuItemId: item.catalogObjectId,
            quantitySold: item.qty,
            revenue: item.revenue,
            revenueExGst: item.revenue.div(1.1),
            source: "API",
          },
        })
      }

      await matchSalesToDishes(dateObj, venue)
      const theoreticalCogs = await calculateTheoreticalCogs(dateObj, venue)

      const exGst = agg.totalIncGst.minus(agg.totalTax)
      const existingSummary = await db.dailySalesSummary.findUnique({
        where: { date_venue: { date: dateObj, venue } },
        select: { source: true, fees: true, cardTakings: true },
      })
      let summaryWritten = false
      if (existingSummary?.source === "EMAIL") {
        await db.dailySalesSummary.update({
          where: { date_venue: { date: dateObj, venue } },
          data: {
            theoreticalCogs,
            cardTakings: pay.cardTakings,
            ...(existingSummary.fees === null ? { fees: pay.fees } : {}),
          },
        })
      } else {
        await db.dailySalesSummary.upsert({
          where: { date_venue: { date: dateObj, venue } },
          update: {
            totalRevenue: agg.totalIncGst,
            totalRevenueExGst: exGst,
            totalOrders: agg.orderCount,
            averageSpend: agg.orderCount > 0 ? exGst.div(agg.orderCount) : new Decimal(0),
            fees: pay.fees,
            cardTakings: pay.cardTakings,
            theoreticalCogs,
            source: "API",
          },
          create: {
            date: dateObj,
            venue,
            totalRevenue: agg.totalIncGst,
            totalRevenueExGst: exGst,
            totalCovers: 0,
            totalOrders: agg.orderCount,
            averageSpend: agg.orderCount > 0 ? exGst.div(agg.orderCount) : new Decimal(0),
            totalVoids: 0,
            totalComps: 0,
            fees: pay.fees,
            cardTakings: pay.cardTakings,
            theoreticalCogs,
            source: "API",
          },
        })
        summaryWritten = true
      }
      await calculateTheoreticalUsage(dateObj, venue)

      results.push({
        venue,
        date: dateStr,
        items: agg.items.length,
        orders: agg.orderCount,
        totalIncGst: agg.totalIncGst.toDecimalPlaces(2).toNumber(),
        fees: pay.fees.toDecimalPlaces(2).toNumber(),
        cardTakings: pay.cardTakings.toDecimalPlaces(2).toNumber(),
        summaryWritten,
      })
    }
  }

  await db.squareConnection.update({
    where: { id: conn.id },
    data: { lastSyncAt: new Date(), lastError: null },
  })
  return results
}
