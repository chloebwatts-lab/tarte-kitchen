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

export interface UberSyncResult { venue: string; name: string; days: number; sales: number; orders: number; error?: string }

/**
 * One shop failing must not stop the others (9 Nov 2026: the accounts@
 * login Kitchen signs in with can see Tarte Takeaway but not the Burleigh
 * shop, and Uber answers "request_error" for a shop the user cannot see).
 * A dead session (UberAuthError) still stops everything and is recorded;
 * any other per-shop error is recorded on that shop's result and the sync
 * counts as done when at least one shop loaded.
 */
export function uberSyncOutcome(results: UberSyncResult[]): { ok: boolean; lastError: string | null } {
  const failed = results.filter((r) => r.error)
  if (results.length && failed.length === results.length) return { ok: false, lastError: failed.map((r) => `${r.name}: ${r.error}`).join("; ") }
  return { ok: true, lastError: null }
}

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
      let rows
      try {
        rows = await fetchDailySales(cookie, store.uuid, from, today)
      } catch (err) {
        if (err instanceof UberAuthError) throw err
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[uber-sync] ${store.name}: ${msg}`)
        results.push({ venue: store.venue, name: store.name, days: 0, sales: 0, orders: 0, error: msg })
        continue
      }
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
    const outcome = uberSyncOutcome(results)
    if (!outcome.ok) throw new Error(outcome.lastError ?? "Uber sync failed")
    await db.uberEatsConnection.update({ where: { id: conn.id }, data: { lastSyncAt: new Date(), lastError: null } })
    return results
  } catch (err) {
    const msg = err instanceof UberAuthError ? err.message : err instanceof Error ? err.message : String(err)
    await db.uberEatsConnection.update({ where: { id: conn.id }, data: { lastError: msg } }).catch(() => {})
    throw err
  }
}
