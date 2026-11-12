import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { accountabilityHeadline, getDailyAccountability } from "@/lib/accountability/daily"
import { reviewHeadline } from "@/lib/reviews/negative"
import { APP_URL } from "@/lib/email/brand"

export const dynamic = "force-dynamic"

/**
 * Headline numbers for Tarte Shifts' 17:00 "Tarte today" email to Chloe.
 * Chloe, 12 Nov 2026: only vital emails; folded into the 17:00 Tarte today
 * email. Replaces chloe@'s copy of the end-of-day email (open items) and the
 * positive-only 08:00 review emails.
 *
 * openItems / unowned: the same two numbers the end-of-day email puts in its
 * subject, from the same builder (Uber pull skipped, it is slow and writes).
 * reviewsToReply / negativeReviews: the pending-reply list on /reviews
 * (DRAFTED, a draft, no live reply), negative = 1 to 3 stars.
 * Read only. Bearer = CRON_SECRET like /api/internal/live-cogs.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const [eod, pending] = await Promise.all([
    getDailyAccountability(new Date(), { uber: false }),
    db.googleReview.findMany({
      where: { replyStatus: "DRAFTED", draftReply: { not: null }, replyText: null },
      select: { rating: true },
    }),
  ])
  const { open, unowned } = accountabilityHeadline(eod.totals)
  const { reviewsToReply, negativeReviews } = reviewHeadline(pending)
  return Response.json({
    ok: true,
    openItems: open,
    unowned,
    reviewsToReply,
    negativeReviews,
    eodUrl: `${APP_URL}/api/cron/daily-accountability?preview=1`,
    reviewsUrl: `${APP_URL}/reviews`,
  })
}
