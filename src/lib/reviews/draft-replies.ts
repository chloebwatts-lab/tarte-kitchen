/**
 * AI-drafted reply workflow for Google reviews.
 *
 * After each hourly sync we call `draftAndNotifyNewReviews()`, which:
 *   1. Finds ALL reviews with no owner reply that haven't been drafted yet
 *      (not just negative ones, replying to every review signals engagement
 *      to Google and boosts local SEO ranking).
 *   2. Generates a warm, on-brand reply via Claude, shorter thank-yous for
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
import { scrubReply, isUsableName, flagsComp } from "./scrub-reply"
import { autoPostReply, qualifiesForAutoReply } from "./auto-reply"
import { APP_URL, BRAND, FONT_BODY, button, callout, para, section, shell, type Tone } from "@/lib/email/brand"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You write owner replies to Google reviews for Tarte, a small cafe group on the Gold Coast, Australia (venues: Tarte Burleigh Bakery, Beach House at Currumbin, Tea Garden at Currumbin).

Brand voice: warm, genuine, conversational Australian English. Write like a real person, not a brand.

For POSITIVE reviews (4-5 stars): short and personal, 2-3 sentences. Acknowledge the specific thing they loved. Mention the venue name once naturally (helps SEO). Invite them back.

For NEGATIVE reviews (1-3 stars): honest apology, take ownership, name the specific issue. Invite them back for another chance. Never defensive. 3-4 sentences.

For RATING-ONLY reviews (no written text): for 4-5 stars, one or two short sentences thanking them by name where available and mentioning the venue naturally; vary the wording so replies don't read templated. For 1-3 stars, a brief genuine note that we'd like to understand what went wrong, inviting them to email hello@tarte.com.au.

Hard rules - breaking any of these is a failure:
- No em dashes or en dashes (no -- or - used as a dash mid-sentence)
- No ellipsis (no ...)
- No hollow phrases: "We appreciate your feedback", "We strive for excellence", "We take this seriously", "rest assured"
- No exclamation marks on every sentence - one at most per reply, only where it genuinely fits
- No "we'd love to see you back" as a stock closer - say something specific
- Write contractions naturally (we're, can't, you'll)
- Product naming: Tarte sells CRULLERS, not churros. If a reviewer calls them churros, use "cruller" in the reply. Never write "churro".
- NEVER offer free goods, vouchers, comps, or "on us" anything. Don't say "next coffee is on us", "come back for a free X", or imply a freebie. Invite them back, but at full price.
- On pricing complaints: don't apologise for the price and don't get defensive. Gently push back. Tarte is actually below market for the volume + ingredient quality we serve, and almost everything is made fresh on-site daily (the bake, the pastry, the bread, the sauces). Frame this matter-of-factly in one short sentence inside the reply, e.g. "We're actually priced under most cafés in our bracket given everything is made on site daily and the volume we put in." Tweak wording to fit the specific complaint; never copy that line verbatim.

Output: the reply text only. No preamble, no quotation marks.`

async function generateDraftReply(review: {
  venue: Venue
  rating: number
  text: string | null
  authorName: string | null
}): Promise<string> {
  const venueName = VENUE_SHORT_LABEL[review.venue] ?? review.venue
  const prompt = [
    `Venue: ${venueName}`,
    `Rating: ${review.rating}/5`,
    // Google truncates some display names to a single word ("The"), and a
    // reply opening "Hey The," went live on a 1-star review in Sep 2026.
    // Withhold the name rather than trust the model to spot a bad one.
    isUsableName(review.authorName) ? `Reviewer: ${review.authorName}` : null,
    ``,
    `Review:`,
    review.text ?? "(rating only, no written text)",
  ]
    .filter(Boolean)
    .join("\n")

  const draftOnce = async (extra?: string) => {
    const res = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: extra ? `${prompt}\n\n${extra}` : prompt }],
    })
    const block = res.content[0]
    if (block.type !== "text") throw new Error("Unexpected Claude response type")
    // Enforce the voice rules the prompt keeps slipping on before the draft is
    // stored, emailed or shown.
    return scrubReply(block.text)
  }

  let draft = await draftOnce()
  // Code backstop for the no-freebies rule: one retry with the slip named,
  // then give up on this review for this run rather than store a comp.
  // It stays undrafted and is picked up next hour.
  const slip = flagsComp(draft)
  if (slip) {
    draft = await draftOnce(
      `Your previous draft said "${slip}", which offers something free or discounted. That is not allowed. Rewrite it with no freebie, voucher, refund, discount or replacement of any kind. Invite them back at full price.`
    )
    const again = flagsComp(draft)
    if (again) throw new Error(`draft still offers a comp ("${again}")`)
  }
  return draft
}

function stars(rating: number): string {
  return "★".repeat(rating) + "☆".repeat(5 - rating)
}

function ratingLabel(rating: number): string {
  if (rating >= 4) return "positive"
  if (rating === 3) return "mixed"
  return "negative"
}

function ratingTone(rating: number): Tone {
  if (rating >= 4) return "done"
  if (rating === 3) return "gold"
  return "warn"
}

type DraftedReview = {
  id: string
  venue: Venue
  rating: number
  authorName: string | null
  text: string | null
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
    const tone = ratingTone(r.rating)
    const meta = `${stars(r.rating)} ${r.rating}/5 · ${date}${r.authorName ? ` · ${r.authorName}` : ""}`

    const reviewText = r.text
      ? para(r.text)
      : `<div style="font-family:${FONT_BODY};font-size:15px;line-height:1.5;color:${BRAND.inkMute};font-style:italic;margin:0 0 8px 0;">Rating only, no written text</div>`

    const actions = `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
      <tr>
        <td style="padding:0 8px 0 0;">${button("Approve & Post", approveUrl)}</td>
        <td style="padding:0 8px 0 0;">${button("Edit", editUrl, { secondary: true })}</td>
        <td>${button("Skip", skipUrl, { secondary: true })}</td>
      </tr>
    </table>`

    return section(
      venueName,
      `${reviewText}<div style="margin-top:4px;">${callout(r.draftReply, tone, { label: "Suggested reply" })}</div>${actions}`,
      { tone, note: meta }
    )
  })

  const html = shell({
    kicker: "Reviews",
    title: `${count} review${count !== 1 ? "s" : ""} to reply to`,
    subtitle: parts.join(" · "),
    preheader: parts.join(" · "),
    sections: [
      `<div style="padding:0 4px;">${para("Replying to every review (positive and negative) boosts your Google local ranking. Negatives are listed first.", { muted: true })}</div>`,
      ...htmlItems,
    ],
    footer: `<a href="${APP_URL}/reviews" style="color:${BRAND.sageDeep};">View all reviews in Tarte Kitchen</a>`,
  })

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
    `Tarte: ${count} review${count !== 1 ? "s" : ""} to reply to`,
    `Replying to all reviews (positive + negative) boosts your Google ranking.`,
    ``,
    textItems,
    ``,
    `View all: ${APP_URL}/reviews`,
  ].join("\n")

  return { html, text }
}

/**
 * Main entry point, called by sync-reviews after ingestion.
 *
 * Finds ALL reviews with no owner reply and no draft yet (any rating).
 * Caps a single batch at 20 to avoid email overload, leftover reviews
 * will be picked up on the next hourly run.
 *
 * Returns the number of drafts sent.
 */
export async function draftAndNotifyNewReviews(): Promise<number> {
  // Retire any draft whose review has since been answered on Google.
  // tarte-seo-engine replies to the same reviews from its own dashboard,
  // and the sync mirrors whatever is live into `replyText`. Without this
  // sweep those drafts sit in the queue and the approval email with an
  // Approve button that would overwrite the published reply.
  // A live reply that matches our own draft means our post landed and
  // only the status write missed, so that one becomes POSTED, not
  // ANSWERED_ELSEWHERE.
  await db.$executeRaw`
    UPDATE "GoogleReview"
       SET "replyStatus" = CASE
             WHEN btrim("replyText") = btrim("draftReply") THEN 'POSTED'::"ReviewReplyStatus"
             ELSE 'ANSWERED_ELSEWHERE'::"ReviewReplyStatus"
           END,
           "replyPostedAt" = CASE
             WHEN btrim("replyText") = btrim("draftReply")
               THEN COALESCE("replyPostedAt", "replyTime", NOW())
             ELSE "replyPostedAt"
           END
     WHERE "replyStatus" IN ('DRAFTED', 'APPROVED')
       AND "replyText" IS NOT NULL`

  // Only draft replies for reviews from the last 30 days. Backfilling
  // years of historical GBP reviews would flood Chloe with thousands of
  // drafts she'd never reply to. New reviews land daily anyway.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const candidates = await db.googleReview.findMany({
    where: {
      replyText: null,    // no existing Google reply
      replyStatus: null,  // not yet drafted
      publishTime: { gte: since30d },
      // Rating-only reviews are worth replying to as well (they count
      // toward the response ratio Google and ReviewPro measure), but
      // only when GBP-ingested so the reply can actually be auto-posted.
      OR: [
        { text: { not: null } },
        { googleReviewId: { startsWith: "accounts/" } },
      ],
    },
    orderBy: [
      { rating: "asc" },          // negatives first
      { publishTime: "desc" },    // newest first within each rating
    ],
    take: 50,  // cap per run, leftover picked up next day
  })

  // Google sometimes re-issues a review under a new id when it's edited,
  // leaving a places/ + accounts/ twin pair. Drafting both would email
  // Chloe the same review twice, so keep one per author+venue+rating
  // cluster, preferring the accounts/ row (postable via the GBP API).
  const clusterKey = (r: (typeof candidates)[number]) =>
    `${r.authorName ?? ""}|${r.venue}|${r.rating}`
  const byCluster = new Map<string, (typeof candidates)[number]>()
  for (const r of candidates) {
    const key = clusterKey(r)
    const existing = byCluster.get(key)
    if (
      !existing ||
      (r.googleReviewId.startsWith("accounts/") &&
        !existing.googleReviewId.startsWith("accounts/"))
    ) {
      byCluster.set(key, r)
    }
  }
  const needsDraft = Array.from(byCluster.values())

  // No early return here: the rating-only 5-star sweep below must run even
  // on a day with nothing new to draft, or the backlog never clears.
  const drafted = await Promise.all(
    needsDraft.map(async (r) => {
      try {
        const draftReply = await generateDraftReply({
          venue: r.venue,
          rating: r.rating,
          text: r.text,
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
        // Non-fatal, review stays null, picked up next run.
        return null
      }
    })
  )

  const freshlyDrafted = drafted.filter(Boolean) as DraftedReview[]

  // Rating-only 5-star rule (Chloe, 2026-09-28): post these without a tap.
  // Covers what was drafted just now AND anything already sitting DRAFTED
  // from before the rule, so the queue clears itself. Anything the auto
  // path holds back stays in the approval email as before.
  const autoCandidates = await db.googleReview.findMany({
    where: {
      replyStatus: "DRAFTED",
      draftReply: { not: null },
      replyText: null,
      rating: 5,
      googleReviewId: { startsWith: "accounts/" },
      OR: [{ text: null }, { text: "" }],
    },
    select: {
      id: true,
      venue: true,
      googleReviewId: true,
      rating: true,
      text: true,
      authorName: true,
      replyText: true,
      draftReply: true,
      publishTime: true,
    },
    orderBy: { publishTime: "asc" },
    take: 60,
  })
  const autoPosted: AutoPostedReview[] = []
  const autoPostedIds = new Set<string>()
  for (const r of autoCandidates) {
    if (!qualifiesForAutoReply(r)) continue
    try {
      const res = await autoPostReply(r)
      if (res.outcome === "posted") {
        autoPosted.push({
          venue: r.venue,
          authorName: r.authorName,
          publishTime: r.publishTime,
          replyText: res.replyText,
        })
        autoPostedIds.add(r.id)
      }
    } catch {
      // Held: stays DRAFTED, lands in the approval list below.
    }
    // Keep well under GBP's write rate.
    await new Promise((res) => setTimeout(res, 250))
  }

  const ready = freshlyDrafted.filter((r) => !autoPostedIds.has(r.id))
  if (ready.length === 0 && autoPosted.length === 0) return 0
  if (ready.length === 0) {
    await sendAutoOnlyEmail(autoPosted)
    return autoPosted.length
  }

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

  const built = buildEmailHtml(ready)
  const auto = autoPostedSection(autoPosted)
  const html = built.html.includes("</body>")
    ? built.html.replace("</body>", `${auto.html}</body>`)
    : built.html + auto.html
  const text = built.text + auto.text

  await sendHtmlEmail({
    to: process.env.REVIEW_SUMMARY_RECIPIENT ?? "chloe@tarte.com.au",
    subject: autoPosted.length
      ? `${subject}, ${autoPosted.length} five-star thank-you${autoPosted.length === 1 ? "" : "s"} posted for you`
      : subject,
    html,
    text,
  })

  return ready.length + autoPosted.length
}

type AutoPostedReview = {
  venue: Venue
  authorName: string | null
  publishTime: Date
  replyText: string
}

/** The "posted for you" block appended to the approval email. */
function autoPostedSection(items: AutoPostedReview[]): { html: string; text: string } {
  if (items.length === 0) return { html: "", text: "" }
  const rows = items
    .map((r) => {
      const who = r.authorName ? escapeHtml(r.authorName) : "Anonymous"
      const venue = escapeHtml(VENUE_SHORT_LABEL[r.venue] ?? r.venue)
      return `<div style="padding:10px 0;border-top:1px solid #eee7da;">
        <div style="font-size:12px;color:#8a857c;margin-bottom:4px;">${venue} · 5 stars, no comment · ${who}</div>
        <div style="font-size:13px;color:#1f1d1a;line-height:1.5;">${escapeHtml(r.replyText)}</div>
      </div>`
    })
    .join("")
  const html = `<div style="max-width:640px;margin:24px auto 0;padding:0 24px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <h3 style="margin:0 0 4px;font-size:15px;color:#4f5b3f;">Posted for you: ${items.length} five-star thank-you${items.length === 1 ? "" : "s"}</h3>
    <p style="margin:0 0 8px;font-size:12px;color:#8a857c;">5-star reviews with no written comment go out without a tap. Nothing to do here, just so you have seen them.</p>
    ${rows}
  </div>`
  const text =
    `\n\nPosted for you (5-star, no comment):\n` +
    items.map((r) => `- ${VENUE_SHORT_LABEL[r.venue] ?? r.venue}, ${r.authorName ?? "Anonymous"}: ${r.replyText}`).join("\n")
  return { html, text }
}

/** When everything this run was auto-posted, a short note rather than an approval email. */
async function sendAutoOnlyEmail(items: AutoPostedReview[]): Promise<void> {
  const { html, text } = autoPostedSection(items)
  await sendHtmlEmail({
    to: process.env.REVIEW_SUMMARY_RECIPIENT ?? "chloe@tarte.com.au",
    subject: `[Tarte] ${items.length} five-star thank-you${items.length === 1 ? "" : "s"} posted for you, nothing to approve`,
    html,
    text,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}
