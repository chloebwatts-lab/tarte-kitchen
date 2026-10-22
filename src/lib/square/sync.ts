import { db } from "@/lib/db"
import Decimal from "decimal.js"
import type { Venue } from "@/generated/prisma/client"
import { normalizeVenueSlug } from "@/lib/venues"
import {
  matchSalesToDishes,
  calculateTheoreticalCogs,
  calculateTheoreticalUsage,
} from "@/lib/sales/enrich"
import { fetchDayOrders, listPayments, aggregateOrders, aggregatePayments, cents } from "./client"
import { getSquareConnections, accessTokenOf, squareLocations } from "./token"
import { isSquareVenueOn } from "@/lib/pos"
import { computeDayBreakdown } from "./breakdown"
import { resolveCatalog, resolveTeam, persistDayBreakdown, resolveModifiers, modifierIdsOf } from "./live"
import { dayOrderRows, persistDayOrders } from "./day-orders"
import { computeUpsell } from "@/lib/sales/upsell"
import { loadGroups, persistUpsell } from "./upsell-store"

export interface SquareSyncResult {
  venue: string
  date: string
  items: number
  orders: number
  totalIncGst: number
  /** Bills open and not yet settled at sync time (not counted as sales). */
  openTablesIncGst: number
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
 * Pull closed orders + payments from Square for each mapped location of
 * each connected account and write item-level DailySales (source API) plus
 * the day's summary. One account failing (expired token) does not stop the
 * others; its error lands on its own row. Rules:
 *  - Item rows always refresh (the Square daily email has no items, so the
 *    API is the only item source for Square venues).
 *  - The summary is written only while no EMAIL row exists for that day:
 *    once Square's own daily summary email lands (~00:30 AEST) that figure
 *    is final and the intraday API number must not replace it. Fees and
 *    card takings are still filled in on an EMAIL row when they are empty.
 */
export async function syncSquareSales(dates: string[]): Promise<SquareSyncResult[]> {
  const conns = await getSquareConnections()
  if (!conns.length) throw new Error("Square not connected")
  const results: SquareSyncResult[] = []
  const failures: string[] = []
  for (const conn of conns) {
    try {
      const token = accessTokenOf(conn)
      await syncAccount(token, squareLocations(conn), dates, results)
      await db.squareConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null } })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      failures.push(`${conn.merchantName ?? conn.merchantId ?? conn.id}: ${msg}`)
      await db.squareConnection.update({ where: { id: conn.id }, data: { lastError: msg } }).catch(() => {})
    }
  }
  if (failures.length === conns.length) throw new Error(failures.join("; "))
  return results
}

async function syncAccount(
  token: string,
  locations: ReturnType<typeof squareLocations>,
  dates: string[],
  results: SquareSyncResult[]
): Promise<void> {
  for (const dateStr of dates) {
    const dateObj = new Date(dateStr)
    for (const loc of locations) {
      const venue = normalizeVenueSlug(loc.venue) as Venue | null
      if (!venue || venue === "BOTH") {
        results.push({ venue: loc.venue, date: dateStr, items: 0, orders: 0, totalIncGst: 0, openTablesIncGst: 0, fees: 0, cardTakings: 0, summaryWritten: false, skipped: "unmapped location" })
        continue
      }
      // Before the venue's cutover the Lightspeed figures are the truth
      // (Burleigh's split day, test sales before go-live).
      if (!isSquareVenueOn(venue, dateStr)) {
        results.push({ venue, date: dateStr, items: 0, orders: 0, totalIncGst: 0, openTablesIncGst: 0, fees: 0, cardTakings: 0, summaryWritten: false, skipped: "before Square cutover" })
        continue
      }
      const [{ sales: orders, openUnpaid }, payments] = await Promise.all([
        fetchDayOrders(token, loc.id, dateStr),
        listPayments(token, loc.id, dateStr),
      ])
      const agg = aggregateOrders(orders)
      const openTablesIncGst = openUnpaid.reduce((s, o) => s.plus(cents(o.total_money)), new Decimal(0))
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
      if (!existingSummary && agg.orderCount === 0 && payments.length === 0 && agg.returnsIncGst.eq(0)) {
        // Nothing rung up and nothing taken: a closed day (Tea Garden on a
        // Monday). No row, so the comparisons treat it as absent, not $0.
      } else if (existingSummary?.source === "EMAIL") {
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

      // Hourly shape, cafe/restaurant/online split and surcharge for the
      // insights page (same orders + payments, no extra Square calls beyond
      // catalogue/team cache misses).
      try {
        const allOrders = [...orders, ...openUnpaid]
        const variationIds = allOrders.flatMap((o) => (o.line_items ?? []).map((l) => l.catalog_object_id ?? "")).filter(Boolean)
        const teamIds = [
          ...(payments as Array<{ team_member_id?: string }>).map((p) => p.team_member_id ?? ""),
          ...(allOrders as Array<{ created_by_team_member_id?: string }>).map((o) => o.created_by_team_member_id ?? ""),
        ].filter(Boolean)
        const [catalog, team, groups, modLists] = await Promise.all([resolveCatalog(token, variationIds), resolveTeam(token, teamIds), loadGroups(), resolveModifiers(token, modifierIdsOf(allOrders))])
        const breakdown = computeDayBreakdown(dateStr, allOrders, payments, (id) => (id ? catalog.get(id) : undefined), (id) => (id ? team.get(id) : undefined), null, (id) => (id ? modLists.get(id) : undefined))
        await persistDayBreakdown(venue, dateStr, breakdown)
        await persistDayOrders(venue, dateStr, dayOrderRows(dateStr, allOrders, payments))
        const upsell = computeUpsell(allOrders, payments, (id) => (id ? catalog.get(id)?.reportingCategory : undefined), (id) => (id ? team.get(id) : undefined), groups)
        await persistUpsell(venue, dateStr, upsell.rows)
      } catch (err) {
        console.error("[sync-square-sales] breakdown", venue, dateStr, err)
      }

      results.push({
        venue,
        date: dateStr,
        items: agg.items.length,
        orders: agg.orderCount,
        totalIncGst: agg.totalIncGst.toDecimalPlaces(2).toNumber(),
        openTablesIncGst: openTablesIncGst.toDecimalPlaces(2).toNumber(),
        fees: pay.fees.toDecimalPlaces(2).toNumber(),
        cardTakings: pay.cardTakings.toDecimalPlaces(2).toNumber(),
        summaryWritten,
      })
    }
  }
}
