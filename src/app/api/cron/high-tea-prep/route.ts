export const dynamic = "force-dynamic"

import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import { getHighTeaDay, saveSnapshot, snapshotsFor } from "@/lib/high-tea/data"
import { highTeaRecipients, renderHighTeaEmail, type Earlier } from "@/lib/high-tea/email"
import { brisbaneDay, type HighTeaStage } from "@/lib/high-tea/prep"
import { sendHtmlEmail } from "@/lib/gmail/send"

/**
 * Tea Garden high tea prep emails (docker-compose cron):
 *   ?stage=48  9am two days before   first list
 *   ?stage=24  9am the day before    updated list, what moved
 *   ?stage=12  9pm the night before  check against the list that went out
 * ?preview=1 renders in the browser without sending or recording (office
 * login is enough); add &day=YYYY-MM-DD to look at another day.
 */
const STAGE: Record<string, { stage: HighTeaStage; offset: number }> = {
  "48": { stage: "48H", offset: 2 },
  "24": { stage: "24H", offset: 1 },
  "12": { stage: "12H", offset: 1 },
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const preview = sp.get("preview") === "1"
  const auth = req.headers.get("authorization")
  const bySecret = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  const byAdmin = preview && !!(await getToken({ req, secret: process.env.NEXTAUTH_SECRET }))
  if (!bySecret && !byAdmin) return new Response("Unauthorized", { status: 401 })

  const cfg = STAGE[sp.get("stage") ?? ""]
  if (!cfg) return Response.json({ ok: false, error: "stage must be 48, 24 or 12" }, { status: 400 })
  const dayParam = sp.get("day")
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : brisbaneDay(cfg.offset)

  try {
    const d = await getHighTeaDay(day)
    const snaps = await snapshotsFor(day)
    // Compare with the list that last went out before this stage.
    const order: HighTeaStage[] = ["48H", "24H", "12H"]
    const before = snaps.filter((s) => order.indexOf(s.stage) < order.indexOf(cfg.stage)).pop()
    const earlier: Earlier | null = before ? { stage: before.stage, guests: before.guests, items: before.items } : null
    const mail = renderHighTeaEmail(d, cfg.stage, earlier)

    if (preview) {
      return new Response(`<title>${mail.subject}</title>${mail.html}`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }
    // Nothing useful to send until the stand items are loaded.
    if (d.lines.length === 0) return Response.json({ ok: true, skipped: "no stand items", day })

    await saveSnapshot(d, cfg.stage)
    const to = highTeaRecipients()
    await sendHtmlEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
    return Response.json({ ok: true, to, day, stage: cfg.stage, guests: d.guests })
  } catch (e) {
    console.error("[high-tea-prep]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
