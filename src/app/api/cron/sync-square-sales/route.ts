export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { syncSquareSales, aestDates } from "@/lib/square/sync"
import { getSquareConnection } from "@/lib/square/token"

/**
 * Square Orders + Payments API poll. ?days=N (1-14, default 1 = yesterday
 * only; days=2 = yesterday + today for the live tracker, every 30 min).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const conn = await getSquareConnection()
  if (!conn) return Response.json({ error: "Square not connected" }, { status: 400 })

  const url = new URL(request.url)
  const daysParam = parseInt(url.searchParams.get("days") ?? "", 10)
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(14, daysParam)) : 1
  const dates = days === 1 ? aestDates(2).slice(0, 1) : aestDates(days)

  try {
    const results = await syncSquareSales(dates)
    return Response.json({ success: true, dates, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sync-square-sales]", err)
    await db.squareConnection.update({ where: { id: conn.id }, data: { lastError: msg } }).catch(() => {})
    return Response.json({ error: msg }, { status: 500 })
  }
}
