/**
 * Pull Uber Eats daily sales for the last N Brisbane days into DailyUberSales
 * (one row per venue-day, upserted, including today's running figure).
 * Records lastSyncAt / lastError on the connection so the Settings card and
 * the Sales page can say when the session has died.
 */
import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { fetchDailySales, UberAuthError } from "./client"
import { getUberConnection, getUberCookie, uberStores } from "./token"
import { brisbaneNow } from "@/lib/sales/insights"
import { shiftDate } from "@/lib/sales/compare"

export interface UberSyncResult { venue: string; name: string; days: number; sales: number; orders: number }

export async function syncUberSales(days: number): Promise<UberSyncResult[]> {
  const conn = await getUberConnection()
  if (!conn) throw new Error("Uber Eats not connected")
  const cookie = await getUberCookie()
  const today = brisbaneNow().date
  const from = shiftDate(today, -(Math.max(1, days) - 1))
  const results: UberSyncResult[] = []
  try {
    for (const store of uberStores(conn)) {
      if (!store.venue) continue
      const rows = await fetchDailySales(cookie, store.uuid, from, today)
      let sales = 0, orders = 0
      for (const r of rows) {
        sales += r.sales; orders += r.orders
        await db.dailyUberSales.upsert({
          where: { date_venue: { date: new Date(r.date), venue: store.venue as Venue } },
          update: { salesIncGst: r.sales, orders: r.orders },
          create: { date: new Date(r.date), venue: store.venue as Venue, salesIncGst: r.sales, orders: r.orders },
        })
      }
      results.push({ venue: store.venue, name: store.name, days: rows.length, sales: Math.round(sales * 100) / 100, orders })
    }
    await db.uberEatsConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null } })
    return results
  } catch (err) {
    const msg = err instanceof UberAuthError ? err.message : err instanceof Error ? err.message : String(err)
    await db.uberEatsConnection.update({ where: { id: conn.id }, data: { lastError: msg } }).catch(() => {})
    throw err
  }
}
