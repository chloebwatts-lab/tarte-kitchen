export const dynamic = "force-dynamic"

import { syncUberSales } from "@/lib/uber/sync"
import { getUberConnection } from "@/lib/uber/token"

/**
 * Uber Eats daily sales poll (Manager website endpoints with the pasted
 * session). ?days=N (1-60, default 3 = two closed days + today).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const conn = await getUberConnection()
  if (!conn) return Response.json({ error: "Uber Eats not connected" }, { status: 400 })

  const url = new URL(request.url)
  const daysParam = parseInt(url.searchParams.get("days") ?? "", 10)
  const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(60, daysParam)) : 3
  try {
    const results = await syncUberSales(days)
    return Response.json({ success: true, days, results })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[sync-uber-sales]", msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
