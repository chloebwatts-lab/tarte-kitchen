export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { sendEmail } from "@/lib/gmail/send"
import { todayAest } from "@/lib/commitments/weeks"
import { gmDigestForCron } from "@/lib/gm/board"
import { gmPasswordIsSet } from "@/lib/gm-auth"
import { THEME_LABEL, type GmDays } from "@/lib/gm/plan"

const CHLOE = process.env.GM_REPORT_RECIPIENT || "chloe@tarte.com.au"
const DESK = "https://kitchen.tarte.com.au/kitchen/gm"

/**
 * Keeps the GM desk airtight without anyone remembering anything.
 *   ?kind=morning     6:30am on a GM day: today's list to Oliver.
 *   ?kind=report-due  Friday 1pm: nudge Oliver if the report isn't sent.
 *   ?kind=wrap        Friday 4pm: if still not sent, Chloe gets what the app can see.
 *   ?kind=close       Sunday 8pm: freeze the app's own readings into the week's
 *                     marks so the month sheet has history. Never overwrites a tick.
 * Add &preview=1 to see what would go out, without sending or writing.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  const url = new URL(request.url)
  const kind = url.searchParams.get("kind") ?? "morning"
  const preview = url.searchParams.get("preview") === "1"

  try {
    // Nothing goes out until Oliver actually has a desk to open, and not in
    // the week it launched (Mon 14 Sep 2026), when half the week predates it.
    if (!(await gmPasswordIsSet())) return Response.json({ ok: true, skipped: "GM password not set yet" })
    const d = await gmDigestForCron()
    if (d.weekStart === "2026-09-14" && (kind === "wrap" || kind === "report-due") && !preview) {
      return Response.json({ ok: true, skipped: "launch week" })
    }
    const today = todayAest()
    const isoDay = today.getUTCDay() === 0 ? 7 : today.getUTCDay()
    const open = (i: (typeof d.items)[number]) => !(i.state === "done" || i.state === "auto-ok" || i.state === "couldnt")

    if (kind === "morning") {
      const theme = d.gmDays[String(isoDay) as keyof GmDays]
      if (!theme) return Response.json({ ok: true, skipped: "not a GM day" })
      if (!d.email) return Response.json({ ok: true, skipped: "no email set for Oliver" })
      const dayOf = new Map(Object.entries(d.gmDays).map(([day, t]) => [t, Number(day)]))
      const todays = d.items.filter((i) => (i.theme === "everyday" || i.theme === theme) && open(i))
      const carried = d.items.filter((i) => i.theme !== "everyday" && i.theme !== theme && open(i) && (dayOf.get(i.theme) ?? 99) < isoDay)
      const next = d.openTasks[0]
      const lines = [
        `GM day: ${THEME_LABEL[theme]}.`,
        "",
        "Today:",
        ...todays.map((i) => `- ${i.title}${i.auto_?.detail ? ` (${i.auto_.detail})` : ""}`),
      ]
      if (carried.length) lines.push("", "Still open from earlier this week:", ...carried.map((i) => `- ${i.title}`))
      if (next) lines.push("", `Next deadline: ${next.title}. Due ${next.dueLabel}${next.daysLeft < 0 ? `, ${Math.abs(next.daysLeft)} days late` : `, ${next.daysLeft} days left`}.`)
      lines.push("", `Tick them off here: ${DESK}`)
      const body = lines.join("\n")
      if (!preview) await sendEmail({ to: d.email, subject: `Today: ${THEME_LABEL[theme]} (${todays.length} to do)`, body })
      return Response.json({ ok: true, kind, preview, to: d.email, body })
    }

    if (kind === "report-due") {
      if (d.reportSent) return Response.json({ ok: true, skipped: "already sent" })
      if (!d.email) return Response.json({ ok: true, skipped: "no email set for Oliver" })
      const body = `Your Friday report to Chloe is due at 3pm.\n\nThe numbers are already filled in. Add two lines and press send:\n${DESK}\n\nStill open this week: ${d.items.filter(open).length}.`
      if (!preview) await sendEmail({ to: d.email, subject: "Friday report due 3pm", body })
      return Response.json({ ok: true, kind, preview, to: d.email, body })
    }

    if (kind === "wrap") {
      if (d.reportSent) return Response.json({ ok: true, skipped: "report was sent" })
      const body = `Oliver has not sent his Friday report. This is what the app can see.\n\n${d.compose("(not sent)", "(not sent)")}`
      if (!preview) await sendEmail({ to: CHLOE, subject: `No Friday report from Oliver, ${d.weekLabel}`, body })
      return Response.json({ ok: true, kind, preview, to: CHLOE, body })
    }

    if (kind === "close") {
      const weekStart = new Date(d.weekStart)
      const toFreeze = d.items.filter((i) => !i.manual && i.auto_ && i.auto_.met !== null)
      if (!preview) {
        for (const i of toFreeze) {
          await db.gmMark.upsert({
            where: { itemSlug_weekStart: { itemSlug: i.slug, weekStart } },
            create: { itemSlug: i.slug, weekStart, met: i.auto_!.met === true, note: `App reading: ${i.auto_!.detail}` },
            update: {},
          })
        }
      }
      return Response.json({ ok: true, kind, preview, frozen: toFreeze.map((i) => ({ slug: i.slug, met: i.auto_!.met })) })
    }

    return Response.json({ ok: false, error: "unknown kind" }, { status: 400 })
  } catch (e) {
    console.error("[gm-nudge]", e)
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "failed" }, { status: 500 })
  }
}
