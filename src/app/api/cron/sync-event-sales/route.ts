export const dynamic = "force-dynamic"

import { syncEventSales } from "@/lib/events-revenue/sync"

/**
 * Xero event invoices into DailyEventSales (the events part of the wage %
 * revenue, Chloe 12 Nov 2026). ?days=N (1-90, default 60, so the 45-day
 * feed Tarte Shifts re-reads always sees settled figures).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const daysParam = parseInt(url.searchParams.get("days") ?? "", 10)
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(90, daysParam)) : 60
  try {
    const results = await syncEventSales(days)
    const failed = results.filter((r) => r.error)
    return Response.json({ success: failed.length < results.length, days, results }, { status: failed.length === results.length ? 502 : 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sync-event-sales]", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
