import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { lastCompletedTarteWeek, startOfTarteWeekUtc } from "@/lib/dates"
import { OWNER_EMAIL } from "@/lib/email/owner"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { runWhereToOrderAudit } from "@/lib/where-to-order/audit-service"
import { renderWhereToOrderEmail } from "@/lib/where-to-order/email"
import { HEAD_CHEFS, renderChefWhatsApp } from "@/lib/where-to-order/whatsapp"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * Wednesday "are we ordering from the supplier on the sheet" check
 * (Chloe, 23 Nov 2026). Runs Wed 14:00 AEST from the cron sidecar, covers
 * the trading week that closed on Tuesday, emails chloe@ only (it carries
 * supplier spend). One email per venue, Burleigh then Currumbin (Chloe,
 * 25 Nov 2026), so each can be forwarded to that venue as it is. A venue's
 * email for a week goes once: a second run skips it unless ?force=1.
 *
 *   ?dry=1          render, do not send (returns subjects, texts, totals)
 *   ?html=1         with dry: return one venue's email HTML, for a look
 *   ?venue=BURLEIGH with html: which venue (default the first)
 *   ?week=YYYY-MM-DD  any day in the week to check (default: last closed week)
 *   ?force=1        send even if that week's email already went
 *   ?whatsapp=1     send nothing; return each head chef's WhatsApp message
 *                   (no spend figures), for the Wednesday WhatsApp send
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
    const { drift, venues } = await runWhereToOrderAudit({ weekStart, weekEnd })
    if (url.searchParams.get("whatsapp") === "1") {
      const messages = venues
        .filter((v) => HEAD_CHEFS[v.venue])
        .map((v) => ({ venue: v.venue, chef: HEAD_CHEFS[v.venue], week: `${v.result.weekStartKey} to ${v.result.weekEndKey}`, text: renderChefWhatsApp({ result: v.result, venue: v.venue }) }))
      return Response.json({ ok: true, messages })
    }
    const emails = venues
      // Burleigh and Currumbin always get theirs; another venue only with a wrong buy.
      .filter((v) => v.venue === "BURLEIGH" || v.venue === "BEACH_HOUSE" || v.result.offLines > 0)
      .map((v) => ({ venue: v.venue, result: v.result, email: renderWhereToOrderEmail({ result: v.result, drift, venue: v.venue }) }))
    if (dry && url.searchParams.get("html") === "1") {
      const pick = emails.find((e) => e.venue === url.searchParams.get("venue")) ?? emails[0]
      return new Response(pick.email.html, { headers: { "content-type": "text/html; charset=utf-8" } })
    }
    const summary = (e: (typeof emails)[number]) => ({
      venue: e.venue,
      week: `${e.result.weekStartKey} to ${e.result.weekEndKey}`,
      subject: e.email.subject,
      sheetLines: e.result.sheetLines,
      offLines: e.result.offLines,
      itemsOff: e.result.itemsOff,
      extraTotal: e.result.extraTotal,
      cheaperTotal: e.result.cheaperTotal,
    })
    if (dry) return Response.json({ ok: true, dry: true, drift: drift.length, emails: emails.map((e) => ({ ...summary(e), text: e.email.text })) })

    const recipient = process.env.WHERE_TO_ORDER_RECIPIENT || OWNER_EMAIL
    const force = url.searchParams.get("force") === "1"
    const out: Array<ReturnType<typeof summary> & { sent: boolean }> = []
    for (const e of emails) {
      const key = `where-to-order-sent:${e.result.weekStartKey}:${e.venue}`
      if (!force && (await db.appSetting.findUnique({ where: { key } }))) {
        out.push({ ...summary(e), sent: false })
        continue
      }
      await sendHtmlEmail({ to: recipient, ...e.email, privateCopy: true })
      const value = new Date().toISOString()
      await db.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
      out.push({ ...summary(e), sent: true })
    }
    return Response.json({ ok: true, to: recipient, drift: drift.length, emails: out })
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
