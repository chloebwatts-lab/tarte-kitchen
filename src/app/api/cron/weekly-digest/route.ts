import { NextRequest } from "next/server"
import { runWeeklyDigest } from "@/lib/weekly-digest/generate"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // SENSITIVE — the digest includes P&L, supplier price detail, wastage,
  // staff feedback. Owner mailbox only. See tarte_recipients.md memory.
  const recipient =
    process.env.WEEKLY_DIGEST_RECIPIENT ||
    process.env.REVIEW_SUMMARY_RECIPIENT ||
    "chloe@tarte.com.au"

  const url = new URL(req.url)
  const forceRegenerate = url.searchParams.get("force") === "1"

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
