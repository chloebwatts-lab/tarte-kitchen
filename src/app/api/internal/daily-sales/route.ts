import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { allRevenueByDay } from "@/lib/sales/all-revenue"
import { brisbaneNow } from "@/lib/sales/insights"

export const dynamic = "force-dynamic"

/** Daily sales totals per venue (ex and inc GST) for Tarte Shifts'
 *  forecast pre-fill and wage %. Bearer = CRON_SECRET, same as the other
 *  internal routes. ?since=YYYY-MM-DD (default 45 days).
 *
 *  exGst / incGst      the tills' end of day (Bopple is inside Square)
 *  uberExGst / IncGst  that venue's Uber Eats the same day
 *  eventsExGst         Xero event invoices dated that day (DailyEventSales)
 *  totalExGst          all of it: the wage % basis (Chloe, 12 Nov 2026:
 *                      "all revenue ... uber bopple and events from Xero")
 *  posMissing          true on a past closed day that only had an event
 *                      (tills 0); see allRevenueByDay. */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const sinceParam = req.nextUrl.searchParams.get("since")
  const since = sinceParam && /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? new Date(`${sinceParam}T00:00:00.000Z`) : new Date(Date.now() - 45 * 86400_000)
  const [rows, uber, events] = await Promise.all([
    db.dailySalesSummary.findMany({ where: { date: { gte: since } }, orderBy: { date: "asc" } }),
    db.dailyUberSales.findMany({ where: { date: { gte: since } }, select: { date: true, venue: true, salesIncGst: true } }),
    db.dailyEventSales.findMany({ where: { date: { gte: since } }, select: { date: true, venue: true, exGst: true } }),
  ])
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  const days = allRevenueByDay(
    rows.map((r) => ({ date: iso(r.date), venue: r.venue, exGst: Number(r.totalRevenueExGst), incGst: Number(r.totalRevenue) })),
    uber.map((u) => ({ date: iso(u.date), venue: u.venue, salesIncGst: Number(u.salesIncGst) })),
    events.map((e) => ({ date: iso(e.date), venue: e.venue, exGst: Number(e.exGst) })),
    brisbaneNow().date,
  )
  return Response.json(
    days.map((d) => ({
      date: d.date,
      venue: d.venue,
      exGst: d.posExGst,
      incGst: d.posIncGst,
      uberExGst: d.uberExGst,
      uberIncGst: d.uberIncGst,
      eventsExGst: d.eventsExGst,
      totalExGst: d.totalExGst,
      ...(d.posMissing ? { posMissing: true } : {}),
    }))
  )
}
