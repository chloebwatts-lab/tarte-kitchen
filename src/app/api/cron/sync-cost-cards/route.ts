export const dynamic = "force-dynamic"
export const maxDuration = 300

import { syncCostCards } from "@/lib/price-alerts/card-sync-service"

/**
 * Nightly 10:20 AEST (after the price alerts): move each ingredient's cost
 * card to what invoices settle at, never above the latest quote, then
 * recost recipes. ?dry=1 returns the plan without writing. Rules in
 * src/lib/price-alerts/card-sync.ts (Chloe, 13 Nov 2026).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1"
  const t0 = Date.now()
  const r = await syncCostCards({ dry })
  return Response.json({
    dry: r.dry,
    applied: r.applied,
    planned: r.plan.updates.length,
    recosted: r.recosted,
    held: r.plan.held,
    aboveQuote: r.plan.aboveQuote,
    updates: r.plan.updates,
    durationMs: Date.now() - t0,
  })
}
