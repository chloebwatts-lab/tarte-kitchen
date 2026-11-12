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

// Chloe, 12 Nov 2026: only vital emails; folded into the 17:00 Tarte today
// email. chloe@ was this nudge's only recipient, so the scheduled send is off
// (and no ChecklistAlert rows are written for it). ?preview=1 still works.
// Set to true to bring the email back.
const CYCLE_EMAIL_ON = false

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

    if (!CYCLE_EMAIL_ON) {
      return Response.json({ ok: true, sent: 0, off: "chloe@ was the only recipient, off since 12 Nov 2026" })
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
