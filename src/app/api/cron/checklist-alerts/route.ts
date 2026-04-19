export const dynamic = "force-dynamic"

import {
  materialiseOverdueAlerts,
  markAlertEmailed,
} from "@/lib/actions/checklist-alerts"
import { sendChecklistAlertEmail } from "@/lib/gmail/send"

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const alerts = await materialiseOverdueAlerts()
  const results = { created: alerts.length, emailed: 0, errors: [] as string[] }

  for (const a of alerts) {
    try {
      await sendChecklistAlertEmail({
        to: a.emailsTo,
        templateName: a.templateName,
        venue: a.venue,
        runDate: a.runDate,
        completedItems: a.completedItems,
        totalItems: a.totalItems,
        minutesOverdue: a.minutesOverdue,
      })
      await markAlertEmailed(a.alertId)
      results.emailed += 1
    } catch (e) {
      results.errors.push(
        `${a.templateName} (${a.venue}): ${(e as Error).message}`
      )
    }
  }

  return Response.json(results)
}
