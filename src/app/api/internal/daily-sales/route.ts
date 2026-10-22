import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { dailySalesFeed } from "@/lib/uber/client"

export const dynamic = "force-dynamic"

/** Daily sales totals per venue (ex and inc GST) for Tarte Shifts'
 *  forecast pre-fill and wage %. Bearer = CRON_SECRET, same as the other
 *  internal routes. ?since=YYYY-MM-DD (default 45 days). exGst / incGst are
 *  the POS end of day; uberExGst / uberIncGst are that venue's Uber Eats the
 *  same day (Louise's revenue = POS + Uber ex GST, see dailySalesFeed). */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const sinceParam = req.nextUrl.searchParams.get("since")
  const since = sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? new Date(`${sinceParam}T00:00:00.000Z`) : new Date(Date.now() - 45 * 86400_000)
  const [rows, uber] = await Promise.all([
    db.dailySalesSummary.findMany({ where: { date: { gte: since } }, orderBy: { date: "asc" } }),
    db.dailyUberSales.findMany({ where: { date: { gte: since } }, select: { date: true, venue: true, salesIncGst: true } }),
  ])
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return Response.json(
    dailySalesFeed(
      rows.map((r) => ({ date: iso(r.date), venue: r.venue, exGst: Number(r.totalRevenueExGst), incGst: Number(r.totalRevenue) })),
      uber.map((u) => ({ date: iso(u.date), venue: u.venue, salesIncGst: Number(u.salesIncGst) })),
    )
  )
}
