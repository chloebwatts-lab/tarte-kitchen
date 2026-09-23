import { NextRequest } from "next/server"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

/** Daily sales totals per venue (ex and inc GST) for Tarte Shifts'
 *  forecast pre-fill. Bearer = CRON_SECRET, same as the other internal
 *  routes. ?since=YYYY-MM-DD (default 45 days). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const sinceParam = req.nextUrl.searchParams.get("since")
  const since = sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? new Date(`${sinceParam}T00:00:00.000Z`) : new Date(Date.now() - 45 * 86400_000)
  const rows = await db.dailySalesSummary.findMany({ where: { date: { gte: since } }, orderBy: { date: "asc" } })
  return Response.json(
    rows.map((r) => ({ date: r.date.toISOString().slice(0, 10), venue: r.venue, exGst: Number(r.totalRevenueExGst), incGst: Number(r.totalRevenue) }))
  )
}
