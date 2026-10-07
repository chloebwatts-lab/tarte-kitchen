/**
 * Uber Eats figure for a venue-day, for the Sales pages. Today comes live
 * from Uber (2-minute in-memory cache, like the Square live view) and is
 * written to DailyUberSales as it goes; closed days come from the table.
 * Never throws: a dead session or no connection returns status "stale" /
 * "none" so the page can say so instead of showing $0.
 */
import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { fetchDailySales, fetchTodaySales, type UberToday } from "./client"
import { getUberConnection, getUberCookie, uberStores } from "./token"

export interface UberDay {
  sales: number
  orders: number
  /** LIVE = from Uber just now, STORED = from the table, NONE = nothing known. */
  status: "LIVE" | "STORED" | "NONE"
  fetchedAt: string | null
  /** Set when the live call failed (expired cookie etc.). */
  error: string | null
}

const cache = new Map<string, { at: number; value: UberDay }>()
const TTL = 2 * 60 * 1000

export async function uberDay(venue: Venue, date: string, isToday: boolean, opts: { force?: boolean } = {}): Promise<UberDay> {
  const conn = await getUberConnection()
  const store = uberStores(conn).find((s) => s.venue === venue)
  const stored = await db.dailyUberSales.findUnique({ where: { date_venue: { date: new Date(date), venue } } })
  const fromTable = (error: string | null): UberDay =>
    stored ? { sales: Number(stored.salesIncGst), orders: stored.orders, status: "STORED", fetchedAt: stored.updatedAt.toISOString(), error }
           : { sales: 0, orders: 0, status: "NONE", fetchedAt: null, error }
  if (!conn || !store) return fromTable(null)
  if (!isToday) return fromTable(null)

  const key = `${venue}:${date}`
  const hit = cache.get(key)
  if (hit && !opts.force && Date.now() - hit.at < TTL) return hit.value
  try {
    const t = await fetchLiveToday(await getUberCookie(), store.uuid, date)
    // Uber's "today" metrics endpoint has been seen answering $0 mid-afternoon
    // (7 Oct 2026) while the daily series still had the real figure. A live
    // $0 never overwrites a stored non-zero day; it just shows the stored one.
    if (t.orders === 0 && stored && stored.orders > 0) {
      console.warn(`[uber-live] ${venue} ${date}: Uber returned 0 orders, keeping stored ${stored.orders} orders`)
      return fromTable(null)
    }
    const value: UberDay = { sales: t.sales, orders: t.orders, status: "LIVE", fetchedAt: new Date().toISOString(), error: null }
    cache.set(key, { at: Date.now(), value })
    await db.dailyUberSales.upsert({
      where: { date_venue: { date: new Date(date), venue } },
      update: { salesIncGst: t.sales, orders: t.orders },
      create: { date: new Date(date), venue, salesIncGst: t.sales, orders: t.orders },
    }).catch(() => {})
    if (conn.lastError) await db.uberEatsConnection.update({ where: { id: conn.id }, data: { lastError: null } }).catch(() => {})
    return value
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[uber-live]", msg)
    await db.uberEatsConnection.update({ where: { id: conn.id }, data: { lastError: msg } }).catch(() => {})
    return fromTable(msg)
  }
}

/**
 * Today's figure: the daily series endpoint first (it is what the sync uses
 * and has stayed right all day), the realtime endpoint only if the day is
 * missing from the series. Both return the same numbers when both work.
 */
async function fetchLiveToday(cookie: string, storeUuid: string, date: string): Promise<UberToday> {
  try {
    const rows = await fetchDailySales(cookie, storeUuid, date, date)
    const row = rows.find((r) => r.date === date)
    if (row) return { sales: row.sales, orders: row.orders, avgTicket: row.orders ? Math.round((row.sales / row.orders) * 100) / 100 : 0 }
  } catch (err) {
    console.warn("[uber-live] daily series failed, trying realtime", err instanceof Error ? err.message : err)
  }
  return fetchTodaySales(cookie, storeUuid, date)
}

/** Daily Uber sales for a venue over a date span (YYYY-MM-DD inclusive). */
export async function uberDailyRows(venue: Venue, from: string, to: string): Promise<Array<{ date: string; sales: number; orders: number }>> {
  const rows = await db.dailyUberSales.findMany({ where: { venue, date: { gte: new Date(from), lte: new Date(to) } } })
  return rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), sales: Number(r.salesIncGst), orders: r.orders }))
}
