export const dynamic = "force-dynamic"
export const maxDuration = 120

import { sendPastryCakesTomorrow, sendPastryMorning } from "@/lib/pastry-orders/alerts"

/**
 * Pastry Orders pushes (Shawna, 28 Nov 2026):
 *   ?kind=morning  (6:30am AEST): what to make today, by venue
 *   ?kind=tomorrow (2pm AEST): celebration cakes due tomorrow
 * ?dry=1 returns the wording and sends nothing.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const dry = ["1", "true", "yes"].includes((url.searchParams.get("dry") ?? "").toLowerCase())
  try {
    const r = url.searchParams.get("kind") === "tomorrow" ? await sendPastryCakesTomorrow({ dry }) : await sendPastryMorning({ dry })
    console.log(`[pastry-orders] ${url.searchParams.get("kind") ?? "morning"}${dry ? " DRY" : ""}: ${r.title ?? "nothing on"}, ${r.sent} sent`)
    return Response.json({ ok: true, ...r })
  } catch (err) {
    console.error("[pastry-orders] cron", err)
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}
