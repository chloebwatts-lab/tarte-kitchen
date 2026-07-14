import { NextRequest } from "next/server"
import { runWeeklySpendEmail } from "@/lib/spend/weekly-email"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // SENSITIVE — carries forecast revenue + supplier spend. Owner mailbox
  // only, never accounts@. See tarte_recipients.md memory.
  const recipient =
    process.env.WEEKLY_DIGEST_RECIPIENT ||
    process.env.REVIEW_SUMMARY_RECIPIENT ||
    "chloe@tarte.com.au"

  // ?dry=1 renders the email and returns it WITHOUT sending — for previews.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1"

  try {
    const result = await runWeeklySpendEmail({ recipient, dryRun })
    return Response.json({ ok: true, ...result })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
