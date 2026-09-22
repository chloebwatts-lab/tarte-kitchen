/**
 * /api/reviews/reply-audit , read-only reply state for the cross-system
 * duplicate check.
 *
 * tarte-seo-engine replies to the same Google reviews we do. Its weekly
 * SEO check compares both sides and flags any review where the two
 * systems hold different replies, or where a draft here is queued for a
 * review it has already answered. It can't read this database directly,
 * so it fetches this endpoint over the droplet's internal network
 * (http://kitchen-app:3000) with the cron secret.
 *
 * Returns one row per review that has a reply or a draft here, keyed by
 * the GBP review id (the last path segment of googleReviewId, which is
 * the same id on both sides). Reply bodies are sent as a length + sha256
 * so the comparison never moves customer-facing text between systems.
 */

export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { db } from "@/lib/db"

function digest(s: string | null): { len: number; sha256: string } | null {
  if (!s) return null
  const norm = s.replace(/\s+/g, " ").trim()
  return {
    len: norm.length,
    sha256: createHash("sha256").update(norm).digest("hex").slice(0, 16),
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new Response("Unauthorized", { status: 401 })
  }

  const rows = await db.googleReview.findMany({
    where: {
      OR: [
        { replyStatus: { not: null } },
        { replyText: { not: null } },
      ],
    },
    select: {
      googleReviewId: true,
      venue: true,
      rating: true,
      authorName: true,
      publishTime: true,
      replyStatus: true,
      replyPostedAt: true,
      replyText: true,
      draftReply: true,
    },
  })

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    count: rows.length,
    reviews: rows.map((r) => ({
      // Last path segment: shared with tarte-seo-engine's gbpReviewName.
      key: r.googleReviewId.split("/").pop(),
      gbpFormat: r.googleReviewId.startsWith("accounts/"),
      venue: r.venue,
      rating: r.rating,
      authorName: r.authorName,
      publishTime: r.publishTime,
      replyStatus: r.replyStatus,
      replyPostedAt: r.replyPostedAt,
      // What is live on Google as far as this app knows.
      live: digest(r.replyText),
      // What this app would post if the draft were approved.
      draft: digest(r.draftReply),
    })),
  })
}
