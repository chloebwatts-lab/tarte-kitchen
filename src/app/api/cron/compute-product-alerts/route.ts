export const dynamic = "force-dynamic"
export const maxDuration = 300

import { computeProductAlerts } from "@/lib/pricing/service"

/**
 * Pricing rebuild (shadow mode): evaluate every supplier product's
 * observation history and open / refresh / auto-close ProductPriceAlerts.
 * Reads only the new tables; never touches v1 flags or v2 PriceAlert.
 * Run nightly after compute-price-alerts so the two can be compared.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const result = await computeProductAlerts()
  return Response.json(result)
}
