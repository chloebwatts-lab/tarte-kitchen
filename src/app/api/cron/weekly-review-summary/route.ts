import { NextRequest } from "next/server"
import { runWeeklySummary } from "@/lib/google-reviews/weekly-summary"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // SENSITIVE — review digests contain business overview / staff feedback /
  // negative-review specifics. Always defaults to chloe@; never accounts@.
  // See tarte_recipients.md memory note for the full routing rule.
  const recipient =
    process.env.REVIEW_SUMMARY_RECIPIENT || "chloe@tarte.com.au"

  try {
    const result = await runWeeklySummary({ recipient })
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
