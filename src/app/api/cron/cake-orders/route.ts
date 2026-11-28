export const dynamic = "force-dynamic"
export const maxDuration = 300

import { importWebsiteCakeOrders, sendCakeMorning, sendCakeReminders } from "@/lib/cakes/import"

/**
 * Cake orders (Shawna, 26 Nov 2026), see src/lib/cakes/import.ts.
 *   ?kind=import (default, every 10 min): website orders in, then reminders
 *   ?kind=morning (6am AEST): today's list to pastry
 * ?dryRun=1 on import lists what it would add and writes nothing;
 * ?days=N looks further back than the usual 3 days (catch-up, max 60).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const kind = url.searchParams.get("kind") ?? "import"
  const dryRun = ["1", "true", "yes"].includes((url.searchParams.get("dryRun") ?? "").toLowerCase())
  try {
    if (kind === "morning") {
      const r = await sendCakeMorning()
      console.log(`[cake-orders] morning: ${r.title ?? "nothing coming up"}, ${r.sent} sent`)
      return Response.json({ ok: true, ...r })
    }
    const days = Number(url.searchParams.get("days") ?? "3") || 3
    const imp = await importWebsiteCakeOrders({ days, dryRun })
    const rem = dryRun ? { due: 0, sent: 0 } : await sendCakeReminders()
    console.log(
      `[cake-orders] import${dryRun ? " DRY RUN" : ""}: found ${imp.found}, fetched ${imp.fetched}, added ${imp.created}, skipped ${imp.skipped}, alerts ${imp.alerts}${imp.reason ? `, ${imp.reason}` : ""}; reminders ${rem.due}`
    )
    return Response.json({ ...imp, reminders: rem }, { status: imp.ok ? 200 : 500 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[cake-orders]", err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
