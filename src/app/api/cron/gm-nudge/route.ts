export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { renderAfternoonNudgeHtml, renderMorningNudgeHtml, renderReportDueHtml } from "@/lib/gm/report-email"
import { todayAest } from "@/lib/commitments/weeks"
import { gmDigestForCron } from "@/lib/gm/board"
import { gmPasswordIsSet } from "@/lib/gm-auth"
import { gmWeekPos } from "@/lib/gm/week"
import { sendGmPush } from "@/lib/gm/push"
import { THEME_LABEL, type GmDays } from "@/lib/gm/plan"

const CHLOE = process.env.GM_REPORT_RECIPIENT || "chloe@tarte.com.au"
const DESK = "https://kitchen.tarte.com.au/kitchen/gm"

/**
 * Keeps the GM desk airtight without anyone remembering anything. Every
 * message to Oliver goes to his phone as an alert (if he has switched
 * alerts on) and to his email (if one is set).
 *   ?kind=morning     6:30am on a GM day: today's list.
 *   ?kind=afternoon   2pm on a GM day: what is still open, only if something is.
 *   ?kind=report-due  Monday 1pm: nudge if the Monday report isn't sent.
 *   ?kind=wrap        Monday 4pm: if still not sent, Chloe gets what the app can see.
 *   ?kind=close       Tuesday 8pm, end of the Wed to Tue week: freeze the app's
 *                     own readings into the week's marks. Never overwrites a tick.
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
    // Nothing goes out until Oliver actually has a desk to open.
    if (!(await gmPasswordIsSet())) return Response.json({ ok: true, skipped: "GM password not set yet" })
    // ...and has opened it once with his password, so no message lands before Chloe has briefed him.
    if (!preview && !(await db.appSetting.findUnique({ where: { key: "gmFirstUnlockAt" } }))) {
      return Response.json({ ok: true, skipped: "Oliver has not opened his desk yet" })
    }
    const d = await gmDigestForCron()
    const today = todayAest()
    const isoDay = today.getUTCDay() === 0 ? 7 : today.getUTCDay()
    const open = (i: (typeof d.items)[number]) => !(i.state === "done" || i.state === "auto-ok" || i.state === "couldnt")

    async function tellOliver(subject: string, short: string, body: string, html: string) {
      if (preview) return { push: "preview", email: d.email || null }
      const push = await sendGmPush(subject, short)
      if (d.email) await sendHtmlEmail({ to: d.email, subject, text: body, html })
      return { push, email: d.email || null }
    }

    if (kind === "morning" || kind === "afternoon") {
      const theme = d.gmDays[String(isoDay) as keyof GmDays]
      if (!theme) return Response.json({ ok: true, skipped: "not a GM day" })
      const posOf = new Map(Object.entries(d.gmDays).map(([day, t]) => [t, gmWeekPos(Number(day))]))
      const todays = d.items.filter((i) => (i.theme === "everyday" || i.theme === theme) && open(i))
      const carried = d.items.filter((i) => i.theme !== "everyday" && i.theme !== theme && open(i) && (posOf.get(i.theme) ?? 99) < gmWeekPos(isoDay))
      const next = d.openTasks[0]

      if (kind === "afternoon") {
        if (todays.length === 0) return Response.json({ ok: true, skipped: "today is done" })
        const subject = `${todays.length} still open today`
        const short = todays.slice(0, 3).map((i) => i.title).join(". ") + (todays.length > 3 ? ` and ${todays.length - 3} more.` : ".")
        const body = ["Still open today:", ...todays.map((i) => `- ${i.title}`), "", `Tick them off here: ${DESK}`].join("\n")
        const html = renderAfternoonNudgeHtml({ todays: todays.map((i) => ({ title: i.title })) })
        return Response.json({ ok: true, kind, preview, out: await tellOliver(subject, short, body, html), body })
      }

      const lines = [`GM day: ${THEME_LABEL[theme]}.`, "", "Today:", ...todays.map((i) => `- ${i.title}${i.auto_?.detail ? ` (${i.auto_.detail})` : ""}`)]
      if (carried.length) lines.push("", "Still open from earlier this week:", ...carried.map((i) => `- ${i.title}`))
      if (next) lines.push("", `Next deadline: ${next.title}. Due ${next.dueLabel}${next.daysLeft < 0 ? `, ${Math.abs(next.daysLeft)} days late` : `, ${next.daysLeft} days left`}.`)
      lines.push("", `Tick them off here: ${DESK}`)
      const subject = `Today: ${THEME_LABEL[theme]} (${todays.length} to do)`
      const short = todays.slice(0, 3).map((i) => i.title).join(". ") + (todays.length > 3 ? ` and ${todays.length - 3} more.` : ".")
      const html = renderMorningNudgeHtml({
        theme,
        todays: todays.map((i) => ({ title: i.title, detail: i.auto_?.detail })),
        carried: carried.map((i) => ({ title: i.title })),
        next: next ?? null,
      })
      return Response.json({ ok: true, kind, preview, out: await tellOliver(subject, short, lines.join("\n"), html), body: lines.join("\n") })
    }

    if (kind === "report-due") {
      if (d.reportSent) return Response.json({ ok: true, skipped: "already sent" })
      const body = `Your Monday report to Chloe is due at 3pm, before your two days off.\n\nThe numbers are already filled in. Add two lines and press send:\n${DESK}\n\nStill open this week: ${d.items.filter(open).length}.`
      const html = renderReportDueHtml({ stillOpen: d.items.filter(open).length })
      return Response.json({ ok: true, kind, preview, out: await tellOliver("Monday report due 3pm", "Numbers are filled in. Add two lines and press send.", body, html), body })
    }

    if (kind === "wrap") {
      if (d.reportSent) return Response.json({ ok: true, skipped: "report was sent" })
      const body = `Oliver has not sent his Monday report. This is what the app can see.\n\n${d.compose("(not sent)", "(not sent)")}`
      if (!preview) await sendHtmlEmail({ to: CHLOE, subject: `No Monday report from Oliver, ${d.weekLabel}`, text: body, html: d.composeHtml("(not sent)", "(not sent)") })
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
