export const dynamic = "force-dynamic"

import { getDailySummaryData } from "@/lib/actions/checklist-alerts"
import { sendDailySummaryEmail } from "@/lib/gmail/send"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    const summary = await getDailySummaryData()
    await sendDailySummaryEmail(summary)
    return Response.json({ ok: true, date: summary.date, incomplete: summary.totalIncomplete })
  } catch (e) {
    console.error("[daily-checklist-summary]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
