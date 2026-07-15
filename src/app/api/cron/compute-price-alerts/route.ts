export const dynamic = "force-dynamic"
export const maxDuration = 300

import { computePriceAlerts } from "@/lib/price-alerts/compute"

/**
 * Recompute the entire PriceAlert table from the last 90 days of invoice
 * data. Designed to run nightly (e.g. 06:00 AEST so chefs see fresh alerts
 * at start of day). Idempotent — running mid-day is also fine.
 *
 * Replaces the previous per-invoice priceChanged flag flow. The processor
 * still writes priceChanged on InvoiceLineItem for backwards-compat with
 * the supplier-invoices.tsx component, but the v2 alert system reads
 * exclusively from PriceAlert and is what the dashboard surfaces.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const result = await computePriceAlerts()
  return Response.json(result)
}
