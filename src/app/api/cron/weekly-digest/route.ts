import { NextRequest } from "next/server"
import { runWeeklyDigest } from "@/lib/weekly-digest/generate"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // SENSITIVE, the digest includes P&L, supplier price detail, wastage,
  // staff feedback. Owner mailbox only. See tarte_recipients.md memory.
  const recipient =
    process.env.WEEKLY_DIGEST_RECIPIENT ||
    process.env.REVIEW_SUMMARY_RECIPIENT ||
    "chloe@tarte.com.au"

  const url = new URL(req.url)
  const forceRegenerate = url.searchParams.get("force") === "1"

  // ?labour=1 — debug: return just the recomputed labour section, no
  // narrative generation, no email, no digest row written. Add
  // &week=YYYY-MM-DD (a Wednesday) to dry-run an earlier pay week.
  if (url.searchParams.get("labour") === "1") {
    const { buildDigestLabour } = await import("@/lib/weekly-digest/aggregator")
    const week = url.searchParams.get("week")
    let now: Date | undefined
    if (week) {
      const start = /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(`${week}T00:00:00Z`) : null
      if (!start || Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== week || start.getUTCDay() !== 3)
        return Response.json({ error: "week must be a Wednesday, YYYY-MM-DD" }, { status: 400 })
      // Midday the Thursday after the week closes: that week is the digest's.
      now = new Date(start.getTime() + 8 * 86400000 + 2 * 3600000)
    }
    return Response.json(await buildDigestLabour(now))
  }

  try {
    const result = await runWeeklyDigest({ recipient, forceRegenerate })
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
