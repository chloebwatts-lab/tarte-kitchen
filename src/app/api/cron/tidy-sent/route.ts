import { NextRequest } from "next/server"
import { sweepPrivateSent } from "@/lib/gmail/sent-tidy"

export const dynamic = "force-dynamic"
export const maxDuration = 300

// Weekly safety sweep (Mon 05:00 AEST, cron sidecar): trash any private
// Sent copy in accounts@ that a sender missed. ?dry=1 logs what it would
// trash and touches nothing. ?days=N limits the search to the last N days.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const sp = req.nextUrl.searchParams
  const dry = sp.get("dry")
  const days = Number(sp.get("days"))
  try {
    const summary = await sweepPrivateSent({
      dryRun: dry === "1" || dry === "true" ? true : undefined,
      newerThanDays: Number.isFinite(days) && days > 0 ? Math.floor(days) : undefined,
    })
    return Response.json({ ok: summary.failed === 0 && summary.errors.length === 0, ...summary })
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
