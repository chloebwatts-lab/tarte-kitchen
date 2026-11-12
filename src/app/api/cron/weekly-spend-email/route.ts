import { NextRequest } from "next/server"
import { runWeeklySpendEmail } from "@/lib/spend/weekly-email"
import { withoutOwner } from "@/lib/email/owner"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  // SENSITIVE, carries forecast revenue + supplier spend. Owner mailbox
  // only, never accounts@. See tarte_recipients.md memory.
  const configured =
    process.env.WEEKLY_DIGEST_RECIPIENT ||
    process.env.REVIEW_SUMMARY_RECIPIENT ||
    "chloe@tarte.com.au"
  // Chloe, 12 Nov 2026: only vital emails; folded into the 17:00 Tarte today
  // email (it carries COGS pace and left to spend). chloe@ comes off; anyone
  // else configured still gets it. Nobody left means render only, no send.
  const recipients = withoutOwner(configured)
  const recipient = recipients.join(", ")

  // ?dry=1 renders the email and returns it WITHOUT sending, for previews.
  const dryRun = new URL(req.url).searchParams.get("dry") === "1"

  try {
    const result = await runWeeklySpendEmail({ recipient, dryRun: dryRun || recipients.length === 0 })
    return Response.json({
      ok: true,
      ...result,
      ...(!dryRun && recipients.length === 0 ? { off: "chloe@ was the only recipient, off since 12 Nov 2026" } : {}),
    })
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
