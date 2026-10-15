export const dynamic = "force-dynamic"

import { getToken } from "next-auth/jwt"
import type { NextRequest } from "next/server"
import type { OrderDept, Venue } from "@/generated/prisma/client"
import { openOrderRequests } from "@/lib/actions/order-requests"
import { orderRequestRecipients, renderOrderRequestEmail } from "@/lib/order-requests/shared"
import { sendHtmlEmail } from "@/lib/gmail/send"

const VENUES: Venue[] = ["BEACH_HOUSE", "BURLEIGH", "TEA_GARDEN"]
const DEPTS: OrderDept[] = ["KITCHEN", "PASTRY"]

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
      const d = req.nextUrl.searchParams.get("dept")
      const dept = DEPTS.find((x) => x === d) ?? "KITCHEN"
      const open = await openOrderRequests(venue, dept)
      const mail = renderOrderRequestEmail({ venue, dept, open })
      return new Response(`<title>${mail.subject}</title>${mail.html}`, {
        headers: { "content-type": "text/html; charset=utf-8" },
      })
    }

    const sent: { venue: Venue; dept: OrderDept; to: string[]; open: number }[] = []
    for (const venue of VENUES) {
      for (const dept of DEPTS) {
        const to = orderRequestRecipients(venue, dept)
        if (to.length === 0) continue
        const open = await openOrderRequests(venue, dept)
        if (open.length === 0) continue
        const mail = renderOrderRequestEmail({ venue, dept, open })
        await sendHtmlEmail({ to, subject: mail.subject, html: mail.html, text: mail.text })
        sent.push({ venue, dept, to, open: open.length })
      }
    }
    return Response.json({ ok: true, sent })
  } catch (e) {
    console.error("[order-requests]", e)
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 })
  }
}
