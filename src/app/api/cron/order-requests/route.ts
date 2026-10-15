export const dynamic = "force-dynamic"

import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import type { Venue } from "@/generated/prisma/client"
import { openOrderRequests } from "@/lib/actions/order-requests"
import { orderRequestRecipients, renderOrderRequestEmail } from "@/lib/order-requests/shared"
import { sendHtmlEmail } from "@/lib/gmail/send"

const VENUES: Venue[] = ["BEACH_HOUSE", "BURLEIGH", "TEA_GARDEN"]

/**
 * 5pm AEST daily (docker-compose cron): the open Order Requests for each
 * venue, emailed to whoever places that venue's orders (Jose at Beach
 * House). Nothing is sent for a venue with no open requests or no
 * recipient. ?preview=1&venue=BEACH_HOUSE renders the email in the
 * browser instead of sending; an office login is enough for the preview.
 */
export async function GET(req: NextRequest) {
  const preview = req.nextUrl.searchParams.get("preview") === "1"
  const auth = req.headers.get("authorization")
  const bySecret = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  const byAdmin = preview && !!(await getToken({ req, secret: process.env.NEXTAUTH_SECRET }))
  if (!bySecret && !byAdmin) return new Response("Unauthorized", { status: 401 })

  try {
    if (preview) {
      const v = req.nextUrl.searchParams.get("venue")
      const venue = VENUES.find((x) => x === v) ?? "BEACH_HOUSE"
      const open = await openOrderRequests(venue)
      const mail = renderOrderRequestEmail({ venue, open })
      return new Response(`<title>${mail.subject}</title>${mail.html}`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }

    const sent: { venue: Venue; to: string[]; open: number }[] = []
    for (const venue of VENUES) {
      const to = orderRequestRecipients(venue)
      if (to.length === 0) continue
      const open = await openOrderRequests(venue)
      if (open.length === 0) continue
      const mail = renderOrderRequestEmail({ venue, open })
      await sendHtmlEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
      sent.push({ venue, to, open: open.length })
    }
    return Response.json({ ok: true, sent })
  } catch (e) {
    console.error("[order-requests]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
