export const dynamic = "force-dynamic"

import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import {
  accountabilityRecipients,
  getDailyAccountability,
  renderDailyAccountability,
} from "@/lib/accountability/daily"
import { sendHtmlEmail } from "@/lib/gmail/send"

/**
 * 5pm AEST daily (docker-compose cron). ?preview=1 renders the email in the
 * browser instead of sending; an office login is enough for the preview so
 * Chloe can check it without the cron secret.
 */
export async function GET(req: NextRequest) {
  const preview = req.nextUrl.searchParams.get("preview") === "1"
  const auth = req.headers.get("authorization")
  const bySecret = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  const byAdmin = preview && !!(await getToken({ req, secret: process.env.NEXTAUTH_SECRET }))
  if (!bySecret && !byAdmin) return new Response("Unauthorized", { status: 401 })

  try {
    const data = await getDailyAccountability()
    const mail = renderDailyAccountability(data)
    if (preview) {
      return new Response(`<title>${mail.subject}</title>${mail.html}`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }
    const to = accountabilityRecipients()
    await sendHtmlEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
    return Response.json({ ok: true, to, totals: data.totals })
  } catch (e) {
    console.error("[daily-accountability]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
