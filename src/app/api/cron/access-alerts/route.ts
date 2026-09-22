export const dynamic = "force-dynamic"

import { accessAlertRecipients, dailyAccessSummary, findNewAlerts, markAlertsSent } from "@/lib/access/alerts"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { list, para, section, shell } from "@/lib/email/brand"

/**
 * Every 10 minutes: owner-only access alerts. ?kind=daily at 5:05pm AEST:
 * deed sign-off progress and the day's traffic. &preview=1 returns what
 * would be sent without sending or marking anything.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const preview = url.searchParams.get("preview") === "1"
  try {
    if (url.searchParams.get("kind") === "daily") {
      const mail = await dailyAccessSummary()
      if (!preview) await sendHtmlEmail({ to: accessAlertRecipients(), subject: mail.subject, text: mail.body, html: mail.html })
      return Response.json({ ok: true, preview, ...mail })
    }
    const alerts = await findNewAlerts()
    if (alerts.length && !preview) {
      const who = `${alerts[0].staffName ?? "sign in"}${alerts.length > 1 ? ` and ${alerts.length - 1} more` : ""}`
      await sendHtmlEmail({
        to: accessAlertRecipients(),
        subject: `Tarte Kitchen access alert: ${who}`,
        text: `${alerts.map((a) => `- ${a.summary}`).join("\n")}\n\nOnly you get this. The person is not told.\nFull trail: the AccessEvent table (ask Claude for a report on anyone).`,
        html: shell({
          kicker: "Access alert",
          title: who,
          subtitle: `${alerts.length} alert${alerts.length === 1 ? "" : "s"} in the last few minutes`,
          preheader: alerts[0].summary,
          sections: [
            section(null, list(alerts.map((a) => ({ text: a.summary, tone: "red" as const }))), { tone: "red" }),
            section(
              null,
              para("Only you get this. The person is not told.") +
                para("Full trail: the AccessEvent table (ask Claude for a report on anyone).", { muted: true })
            ),
          ],
          footer: "Only you get this email. Nobody is told when an alert fires.",
        }),
      })
      await markAlertsSent(alerts)
    }
    return Response.json({ ok: true, preview, alerts: alerts.length, summaries: alerts.map((a) => a.summary) })
  } catch (e) {
    console.error("[access-alerts]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
