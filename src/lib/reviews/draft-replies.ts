/**
 * AI-drafted reply workflow for Google reviews.
 *
 * After each hourly sync we call `draftAndNotifyNewReviews()`, which:
 *   1. Finds reviews with rating ≤ 3 that have no owner reply and haven't
 *      been drafted yet.
 *   2. Generates a warm, on-brand reply via Claude.
 *   3. Stores the draft + a one-time token on the row.
 *   4. Emails Chloe with the review text, draft reply, and
 *      Approve / Skip links.
 *
 * When Chloe clicks Approve, /api/reviews/reply?token=xxx&action=approve
 * marks the row APPROVED and (if GBP is connected) posts the reply to
 * Google automatically. Skip → SKIPPED, no post.
 */

import Anthropic from "@anthropic-ai/sdk"
import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma/enums"

const APP_URL = "https://kitchen.tarte.com.au"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You write owner replies to Google reviews for Tarte — a small, design-led café group on the Gold Coast (Tarte Burleigh Bakery, Beach House, Tea Garden).

Brand voice: warm, genuine, human. No corporate-speak, no hollow phrases like "We strive for excellence." Short paragraphs. Acknowledge the specific thing they mentioned. If negative: apologise, take ownership, invite them back. Never defensive.

Output: the reply text only. No preamble, no quotation marks around it. 2–4 sentences max.`

async function generateDraftReply(review: {
  venue: Venue
  rating: number
  text: string
  authorName: string | null
}): Promise<string> {
  const venueName = VENUE_SHORT_LABEL[review.venue] ?? review.venue
  const prompt = [
    `Venue: ${venueName}`,
    `Rating: ${review.rating}/5`,
    review.authorName ? `Reviewer: ${review.authorName}` : null,
    ``,
    `Review:`,
    review.text,
  ]
    .filter(Boolean)
    .join("\n")

  const res = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  })

  const block = res.content[0]
  if (block.type !== "text") throw new Error("Unexpected Claude response type")
  return block.text.trim()
}

function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating)
}

function buildEmailHtml(
  reviews: Array<{
    id: string
    venue: Venue
    rating: number
    authorName: string | null
    text: string
    publishTime: Date
    draftReply: string
    replyToken: string
  }>
): { html: string; text: string } {
  const count = reviews.length
  const subject = count === 1 ? "1 review needs your reply" : `${count} reviews need your reply`

  const htmlItems = reviews
    .map((r) => {
      const venueName = VENUE_SHORT_LABEL[r.venue] ?? r.venue
      const date = r.publishTime.toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Brisbane",
      })
      const approveUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=approve`
      const skipUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=skip`

      return `
      <div style="margin-bottom:32px;border:1px solid #d9d2c4;border-radius:8px;overflow:hidden;font-family:sans-serif;">
        <div style="background:#4f5b3f;color:#fff;padding:12px 16px;">
          <strong>${venueName}</strong>
          &nbsp;·&nbsp;${stars(r.rating)} (${r.rating}/5)
          &nbsp;·&nbsp;<span style="opacity:.8;">${date}</span>
          ${r.authorName ? `&nbsp;·&nbsp;<em>${r.authorName}</em>` : ""}
        </div>
        <div style="padding:16px;background:#fff;">
          <p style="margin:0 0 12px;color:#1f1d1a;line-height:1.5;">${r.text.replace(/\n/g, "<br>")}</p>
          <div style="background:#eef2e7;border:1px solid #d9d2c4;border-radius:6px;padding:14px;margin-bottom:16px;">
            <div style="font-size:11px;color:#8a857c;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px;">Claude's suggested reply</div>
            <p style="margin:0;color:#1f1d1a;line-height:1.6;">${r.draftReply.replace(/\n/g, "<br>")}</p>
          </div>
          <div style="display:flex;gap:10px;">
            <a href="${approveUrl}"
               style="display:inline-block;padding:10px 20px;background:#4f5b3f;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
              ✓ Approve &amp; Post
            </a>
            <a href="${skipUrl}"
               style="display:inline-block;padding:10px 20px;background:#fff;color:#4a4641;text-decoration:none;border-radius:6px;font-size:14px;border:1px solid #d9d2c4;">
              Skip
            </a>
          </div>
        </div>
      </div>`
    })
    .join("")

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#f5f0e8;">
  <div style="max-width:600px;margin:0 auto;">
    <h2 style="font-family:sans-serif;color:#1f1d1a;margin:0 0 6px;">
      Tarte Kitchen — Reviews needing a reply
    </h2>
    <p style="font-family:sans-serif;color:#8a857c;margin:0 0 24px;font-size:14px;">
      ${count} review${count !== 1 ? "s" : ""} with ≤ 3 stars and no response yet.
      Clicking <strong>Approve &amp; Post</strong> will post the reply to Google automatically.
    </p>
    ${htmlItems}
    <p style="font-family:sans-serif;color:#8a857c;font-size:12px;margin-top:24px;">
      Tarte Kitchen · <a href="${APP_URL}/reviews" style="color:#4f5b3f;">View all reviews</a>
    </p>
  </div>
</body>
</html>`

  const textItems = reviews
    .map((r) => {
      const venueName = VENUE_SHORT_LABEL[r.venue] ?? r.venue
      const approveUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=approve`
      const skipUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=skip`
      return [
        `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
        `${venueName} · ${r.rating}/5${r.authorName ? ` · ${r.authorName}` : ""}`,
        ``,
        r.text,
        ``,
        `Suggested reply:`,
        r.draftReply,
        ``,
        `Approve: ${approveUrl}`,
        `Skip:    ${skipUrl}`,
      ].join("\n")
    })
    .join("\n\n")

  const text = [
    `Tarte Kitchen — ${subject}`,
    ``,
    textItems,
    ``,
    `View all reviews: ${APP_URL}/reviews`,
  ].join("\n")

  return { html, text }
}

/**
 * Main entry point — called by sync-reviews after ingestion.
 * Returns the number of drafts sent.
 */
export async function draftAndNotifyNewReviews(): Promise<number> {
  // Find reviews that need a draft: ≤3 stars, no existing reply,
  // no draft started yet, has review text to reply to.
  const needsDraft = await db.googleReview.findMany({
    where: {
      rating: { lte: 3 },
      replyText: null,        // Google hasn't recorded an owner reply
      replyStatus: null,      // we haven't drafted one yet
      text: { not: null },    // can't reply to a text-less review
    },
    orderBy: { publishTime: "asc" },
  })

  if (needsDraft.length === 0) return 0

  // Generate drafts concurrently (cheap Haiku calls).
  const drafted = await Promise.all(
    needsDraft.map(async (r) => {
      try {
        const draftReply = await generateDraftReply({
          venue: r.venue,
          rating: r.rating,
          text: r.text!,
          authorName: r.authorName,
        })
        const replyToken = randomUUID()
        await db.googleReview.update({
          where: { id: r.id },
          data: {
            replyStatus: "DRAFTED",
            draftReply,
            draftSentAt: new Date(),
            replyToken,
          },
        })
        return { ...r, draftReply, replyToken }
      } catch {
        // Non-fatal: if Claude fails for one review, skip it — it'll be
        // picked up on the next sync run (replyStatus stays null).
        return null
      }
    })
  )

  const ready = drafted.filter(Boolean) as NonNullable<(typeof drafted)[number]>[]
  if (ready.length === 0) return 0

  const count = ready.length
  const subject =
    count === 1
      ? `[Tarte] 1 review needs your reply`
      : `[Tarte] ${count} reviews need your reply`

  const { html, text } = buildEmailHtml(
    ready.map((r) => ({
      id: r.id,
      venue: r.venue,
      rating: r.rating,
      authorName: r.authorName,
      text: r.text!,
      publishTime: r.publishTime,
      draftReply: r.draftReply,
      replyToken: r.replyToken,
    }))
  )

  await sendHtmlEmail({
    to: process.env.REVIEW_SUMMARY_RECIPIENT ?? "chloe@tarte.com.au",
    subject,
    html,
    text,
  })

  return ready.length
}
