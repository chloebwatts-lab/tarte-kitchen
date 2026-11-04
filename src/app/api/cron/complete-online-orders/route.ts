export const dynamic = "force-dynamic"

import { completeOnlineOrders } from "@/lib/square/complete-online"

/**
 * 23:55 AEST nightly: complete the day's paid Bopple orders in Square so
 * Amaka sends them to Xero (only orders placed on or after 1 Nov 2026; see
 * complete-online.ts). ?dryRun=1 lists what it would complete and changes
 * nothing.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const dryRun = url.searchParams.get("dryRun") === "1"
  try {
    const reports = await completeOnlineOrders({ dryRun })
    for (const r of reports) {
      console.log(`[complete-online-orders] ${r.venue}${r.dryRun ? " DRY RUN" : ""}: open ${r.open}, completed ${r.completed.length} ($${r.completedIncGst.toFixed(2)}), failed ${r.failed.length}, skipped ${JSON.stringify(r.skipped)}${r.capped ? ", CAPPED" : ""}`)
    }
    const failed = reports.some((r) => r.failed.length > 0)
    return Response.json({ success: !failed, reports }, { status: failed ? 500 : 200 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[complete-online-orders]", err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
