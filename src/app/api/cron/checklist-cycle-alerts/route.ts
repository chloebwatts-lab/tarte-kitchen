export const dynamic = "force-dynamic"

import {
  getCycleEndingChecklists,
  previewCycleEndingChecklists,
  markCycleAlertsEmailed,
} from "@/lib/actions/checklist-alerts"
import { sendChecklistCycleEmail } from "@/lib/gmail/send"

/**
 * Near-deadline nudge for weekly/monthly checklists. Runs daily; the query
 * only returns rows on the last day(s) of a cycle that still has open items.
 * One consolidated email to chloe@ listing what's left, idempotent per cycle.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  try {
    // ?preview=1, read-only: return what the nudge would list right now
    // (ignores the day-of-cycle gate, sends nothing, writes nothing).
    if (new URL(request.url).searchParams.get("preview") === "1") {
      const rows = await previewCycleEndingChecklists()
      const openItems = rows.reduce((s, r) => s + r.openItems.length, 0)
      return Response.json({ ok: true, preview: true, lists: rows.length, openItems, rows })
    }

    const { rows, alertIds } = await getCycleEndingChecklists()
    if (rows.length === 0) {
      return Response.json({ ok: true, sent: 0 })
    }
    await sendChecklistCycleEmail({ rows })
    await markCycleAlertsEmailed(alertIds)
    const openItems = rows.reduce((s, r) => s + r.openItems.length, 0)
    return Response.json({ ok: true, sent: rows.length, openItems })
  } catch (e) {
    console.error("[checklist-cycle-alerts]", e)
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: 500 }
    )
  }
}
