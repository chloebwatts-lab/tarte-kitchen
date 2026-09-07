export const dynamic = "force-dynamic"
export const maxDuration = 300

import { computeProductAlerts, ingestMissingObservations } from "@/lib/pricing/service"

/**
 * Pricing rebuild (shadow mode): evaluate every supplier product's
 * observation history and open / refresh / auto-close ProductPriceAlerts.
 * Reads only the new tables; never touches v1 flags or v2 PriceAlert.
 * Run nightly after compute-price-alerts so the two can be compared.
 *
 * First ingests any invoice in the last year whose matched lines have no
 * observation yet (batched), so history builds itself after deploy and
 * nobody has to run a backfill by hand.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const backfill = await ingestMissingObservations()
  const result = await computeProductAlerts()
  return Response.json({ backfill, ...result })
}
