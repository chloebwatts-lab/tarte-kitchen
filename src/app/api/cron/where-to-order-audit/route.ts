import { NextRequest } from "next/server"
import { lastCompletedTarteWeek, startOfTarteWeekUtc } from "@/lib/dates"
import { OWNER_EMAIL } from "@/lib/email/owner"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { runWhereToOrderAudit } from "@/lib/where-to-order/audit-service"
import { renderWhereToOrderEmail } from "@/lib/where-to-order/email"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Wednesday "are we ordering from the supplier on the sheet" check
 * (Chloe, 23 Nov 2026). Runs Wed 14:00 AEST from the cron sidecar, covers
 * the trading week that closed on Tuesday, emails chloe@ only (it carries
 * supplier spend).
 *
 *   ?dry=1          render, do not send (returns subject, text, totals)
 *   ?html=1         with dry: return the email HTML itself, for a look
 *   ?week=YYYY-MM-DD  any day in the week to check (default: last closed week)
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(req.url)
  const dry = url.searchParams.get("dry") === "1"
  const weekParam = url.searchParams.get("week")

  let weekStart: Date
  let weekEnd: Date
  if (weekParam && /^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    weekStart = startOfTarteWeekUtc(new Date(`${weekParam}T12:00:00+10:00`))
    weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)
    weekEnd.setUTCHours(23, 59, 59, 999)
  } else {
    const wk = lastCompletedTarteWeek()
    weekStart = wk.start
    weekEnd = wk.end
  }

  try {
    const { result, drift } = await runWhereToOrderAudit({ weekStart, weekEnd })
    const email = renderWhereToOrderEmail({ result, drift })
    if (dry && url.searchParams.get("html") === "1") {
      return new Response(email.html, { headers: { "content-type": "text/html; charset=utf-8" } })
    }
    const summary = {
      week: `${result.weekStartKey} to ${result.weekEndKey}`,
      subject: email.subject,
      sheetLines: result.sheetLines,
      offLines: result.offLines,
      itemsOff: result.itemsOff,
      extraTotal: result.extraTotal,
      cheaperTotal: result.cheaperTotal,
      byVenue: result.byVenue,
      drift: drift.length,
    }
    if (dry) return Response.json({ ok: true, dry: true, ...summary, text: email.text })
    const recipient = process.env.WHERE_TO_ORDER_RECIPIENT || OWNER_EMAIL
    await sendHtmlEmail({ to: recipient, ...email, privateCopy: true })
    return Response.json({ ok: true, sent: recipient, ...summary })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
