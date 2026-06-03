/**
 * AI-drafted reply workflow for Google reviews.
 *
 * After each hourly sync we call `draftAndNotifyNewReviews()`, which:
 *   1. Finds ALL reviews with no owner reply that haven't been drafted yet
 *      (not just negative ones — replying to every review signals engagement
 *      to Google and boosts local SEO ranking).
 *   2. Generates a warm, on-brand reply via Claude — shorter thank-yous for
 *      positive reviews, fuller apologies + invite-back for negative.
 *   3. Stores the draft + a one-time token on the row.
 *   4. Emails Chloe with the reviews grouped by venue + sentiment, with
 *      one-click Approve / Skip links for each.
 *
 * When Chloe clicks Approve, /api/reviews/reply?token=xxx&action=approve
 * marks the row APPROVED and (if GBP is connected) posts the reply to
 * Google automatically. Skip → SKIPPED, no post.
 *
 * NOTE on review counts: we currently only capture ~10 reviews per venue
 * from the Places API (5 most-relevant + 5 newest). The full history
 * requires the GBP Business Profile API (paginated). Once the GBP quota
 * increase is approved, ingestAllVenuesGbp() will backfill everything and
 * those will be picked up by the next hourly draft run.
 */

import Anthropic from "@anthropic-ai/sdk"
import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"
import { sendHtmlEmail } from "@/lib/gmail/send"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma/enums"

const APP_URL = "https://kitchen.tarte.com.au"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You write owner replies to Google reviews for Tarte, a small cafe group on the Gold Coast, Australia (venues: Tarte Burleigh Bakery, Beach House at Currumbin, Tea Garden at Currumbin).

Brand voice: warm, genuine, conversational Australian English. Write like a real person, not a brand.

For POSITIVE reviews (4-5 stars): short and personal, 2-3 sentences. Acknowledge the specific thing they loved. Mention the venue name once naturally (helps SEO). Invite them back.

For NEGATIVE reviews (1-3 stars): honest apology, take ownership, name the specific issue. Invite them back for another chance. Never defensive. 3-4 sentences.

Hard rules - breaking any of these is a failure:
- No em dashes or en dashes (no -- or - used as a dash mid-sentence)
- No ellipsis (no ...)
- No hollow phrases: "We appreciate your feedback", "We strive for excellence", "We take this seriously", "rest assured"
- No exclamation marks on every sentence - one at most per reply, only where it genuinely fits
- No "we'd love to see you back" as a stock closer - say something specific
- Write contractions naturally (we're, can't, you'll)
- Product naming: Tarte sells CRULLERS, not churros. If a reviewer calls them churros, use "cruller" in the reply. Never write "churro".

Output: the reply text only. No preamble, no quotation marks.`

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

function ratingLabel(rating: number): string {
  if (rating >= 4) return "positive"
  if (rating === 3) return "mixed"
  return "negative"
}

function ratingColor(rating: number): string {
  if (rating >= 4) return "#4f5b3f"  // sage green
  if (rating === 3) return "#b45309"  // amber
  return "#b91c1c"                    // red
}

function ratingBg(rating: number): string {
  if (rating >= 4) return "#eef2e7"
  if (rating === 3) return "#fef3c7"
  return "#fee2e2"
}

type DraftedReview = {
  id: string
  venue: Venue
  rating: number
  authorName: string | null
  text: string
  publishTime: Date
  draftReply: string
  replyToken: string
}

function buildEmailHtml(reviews: DraftedReview[]): { html: string; text: string } {
  const count = reviews.length
  const negCount = reviews.filter(r => r.rating <= 3).length
  const posCount = reviews.filter(r => r.rating >= 4).length

  // Sort: negatives first (need attention), then positives
  const sorted = [
    ...reviews.filter(r => r.rating <= 3).sort((a, b) => a.rating - b.rating),
    ...reviews.filter(r => r.rating >= 4).sort((a, b) => b.rating - a.rating),
  ]

  const parts: string[] = []
  if (negCount > 0 && posCount > 0) {
    parts.push(`${negCount} need attention · ${posCount} positive`)
  } else if (negCount > 0) {
    parts.push(`${negCount} need attention`)
  } else {
    parts.push(`${posCount} positive`)
  }

  const htmlItems = sorted.map((r) => {
    const venueName = VENUE_SHORT_LABEL[r.venue] ?? r.venue
    const date = r.publishTime.toLocaleDateString("en-AU", {
      day: "numeric", month: "short", year: "numeric",
      timeZone: "Australia/Brisbane",
    })
    const approveUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=approve`
    const editUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=edit`
    const skipUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=skip`
    const color = ratingColor(r.rating)
    const bg = ratingBg(r.rating)

    return `
    <div style="margin-bottom:24px;border:1px solid #d9d2c4;border-radius:8px;overflow:hidden;font-family:sans-serif;">
      <div style="background:${color};color:#fff;padding:10px 16px;display:flex;align-items:center;gap:8px;">
        <strong>${venueName}</strong>
        &nbsp;·&nbsp;${stars(r.rating)} (${r.rating}/5)
        &nbsp;·&nbsp;<span style="opacity:.85;font-size:13px;">${date}</span>
        ${r.authorName ? `&nbsp;·&nbsp;<em style="opacity:.85;">${r.authorName}</em>` : ""}
      </div>
      <div style="padding:14px 16px;background:#fff;">
        <p style="margin:0 0 12px;color:#1f1d1a;line-height:1.55;font-size:14px;">${(r.text || "").replace(/\n/g, "<br>")}</p>
        <div style="background:${bg};border:1px solid #d9d2c4;border-radius:6px;padding:12px 14px;margin-bottom:14px;">
          <div style="font-size:11px;color:#8a857c;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px;">Suggested reply</div>
          <p style="margin:0;color:#1f1d1a;line-height:1.6;font-size:14px;">${r.draftReply.replace(/\n/g, "<br>")}</p>
        </div>
        <div>
          <a href="${approveUrl}"
             style="display:inline-block;padding:8px 18px;background:${color};color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;margin-right:6px;">
            ✓ Approve &amp; Post
          </a>
          <a href="${editUrl}"
             style="display:inline-block;padding:8px 18px;background:#fff;color:${color};text-decoration:none;border-radius:6px;font-size:13px;font-weight:600;border:1px solid ${color};margin-right:6px;">
            ✏️ Edit
          </a>
          <a href="${skipUrl}"
             style="display:inline-block;padding:8px 18px;background:#fff;color:#4a4641;text-decoration:none;border-radius:6px;font-size:13px;border:1px solid #d9d2c4;">
            Skip
          </a>
        </div>
      </div>
    </div>`
  }).join("")

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:24px;background:#f5f0e8;">
  <div style="max-width:600px;margin:0 auto;">
    <h2 style="font-family:sans-serif;color:#1f1d1a;margin:0 0 4px;">
      Tarte — ${count} review${count !== 1 ? "s" : ""} to reply to
    </h2>
    <p style="font-family:sans-serif;color:#8a857c;margin:0 0 6px;font-size:14px;">${parts.join(" · ")}</p>
    <p style="font-family:sans-serif;color:#8a857c;margin:0 0 24px;font-size:13px;">
      Replying to every review (positive and negative) boosts your Google local ranking.
      Negatives are listed first.
    </p>
    ${htmlItems}
    <p style="font-family:sans-serif;color:#8a857c;font-size:12px;margin-top:16px;">
      <a href="${APP_URL}/reviews" style="color:#4f5b3f;">View all reviews in Tarte Kitchen</a>
    </p>
  </div>
</body>
</html>`

  const textItems = sorted.map((r) => {
    const venueName = VENUE_SHORT_LABEL[r.venue] ?? r.venue
    const approveUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=approve`
    const editUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=edit`
    const skipUrl = `${APP_URL}/api/reviews/reply?token=${r.replyToken}&action=skip`
    return [
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      `${venueName} · ${r.rating}/5 (${ratingLabel(r.rating)})${r.authorName ? ` · ${r.authorName}` : ""}`,
      ``,
      r.text || "(no text)",
      ``,
      `Suggested reply:`,
      r.draftReply,
      ``,
      `Approve: ${approveUrl}`,
      `Edit:    ${editUrl}`,
      `Skip:    ${skipUrl}`,
    ].join("\n")
  }).join("\n\n")

  const text = [
    `Tarte — ${count} review${count !== 1 ? "s" : ""} to reply to`,
    `Replying to all reviews (positive + negative) boosts your Google ranking.`,
    ``,
    textItems,
    ``,
    `View all: ${APP_URL}/reviews`,
  ].join("\n")

  return { html, text }
}

/**
 * Main entry point — called by sync-reviews after ingestion.
 *
 * Finds ALL reviews with no owner reply and no draft yet (any rating).
 * Caps a single batch at 20 to avoid email overload — leftover reviews
 * will be picked up on the next hourly run.
 *
 * Returns the number of drafts sent.
 */
export async function draftAndNotifyNewReviews(): Promise<number> {
  // Only draft replies for reviews from the last 30 days. Backfilling
  // years of historical GBP reviews would flood Chloe with thousands of
  // drafts she'd never reply to. New reviews land daily anyway.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const needsDraft = await db.googleReview.findMany({
    where: {
      replyText: null,    // no existing Google reply
      replyStatus: null,  // not yet drafted
      text: { not: null },
      publishTime: { gte: since30d },
    },
    orderBy: [
      { rating: "asc" },          // negatives first
      { publishTime: "desc" },    // newest first within each rating
    ],
    take: 50,  // cap per run — leftover picked up next day
  })

  if (needsDraft.length === 0) return 0

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
        // Non-fatal — review stays null, picked up next run.
        return null
      }
    })
  )

  const ready = drafted.filter(Boolean) as DraftedReview[]
  if (ready.length === 0) return 0

  const count = ready.length
  const negCount = ready.filter(r => r.rating <= 3).length
  const posCount = ready.filter(r => r.rating >= 4).length

  let subject: string
  if (negCount > 0 && posCount > 0) {
    subject = `[Tarte] ${count} reviews to reply to (${negCount} negative, ${posCount} positive)`
  } else if (negCount > 0) {
    subject = `[Tarte] ${count} review${count !== 1 ? "s" : ""} need${count === 1 ? "s" : ""} your reply`
  } else {
    subject = `[Tarte] ${count} positive review${count !== 1 ? "s" : ""} to reply to`
  }

  const { html, text } = buildEmailHtml(ready)

  await sendHtmlEmail({
    to: process.env.REVIEW_SUMMARY_RECIPIENT ?? "chloe@tarte.com.au",
    subject,
    html,
    text,
  })

  return ready.length
}
