export const dynamic = "force-dynamic"
export const maxDuration = 300

import { recalculateAll } from "@/lib/actions/ingredients"

/**
 * Recost every preparation (children first) and every dish from the
 * current ingredient cost cards, using the app's own costing code. Run it
 * after cost cards are corrected straight in the database (13 Nov 2026:
 * 80+ cards brought back to what invoices actually charge), so recipe
 * costs follow the same way they do after an Accept on a price alert.
 * Not scheduled; call by hand with the cron secret.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const t0 = Date.now()
  await recalculateAll()
  return Response.json({ ok: true, durationMs: Date.now() - t0 })
}
