/**
 * Auto-post rule for review replies.
 *
 * Chloe's rule (2026-09-28): a 5-star review with no written text needs no
 * human tap. There is nothing to respond to beyond "thanks", the drafts are
 * two short sentences, and clicking Approve on each one was the whole reason
 * the queue kept backing up. Everything else (any written review, any rating
 * under 5) still goes through the approval email and /reviews.
 *
 * What still has to be true before a reply goes out on its own:
 *   - rating is 5 and the review has no text
 *   - the review came in via GBP (Places-API rows can't be posted to anyway)
 *   - the draft passes the deterministic checks in `autoReplyProblem`
 *     (no freebie, no dash, no churro, sane length, no greeting of a
 *     non-name, no URL or price)
 *   - Google has no reply live on it already (tarte-seo-engine replies to
 *     the same reviews; see already-answered.ts)
 *
 * If any of that fails the review simply stays DRAFTED and turns up in the
 * approval email like before. Auto-posted replies are listed in that same
 * email under their own heading so Chloe still sees what went out.
 */

import { db } from "@/lib/db"
import { postGbpReply } from "@/lib/gbp/post-reply"
import { checkAlreadyAnswered } from "./already-answered"
import { flagsComp, isUsableName, scrubReply } from "./scrub-reply"

export const AUTO_REPLY_MIN_CHARS = 15
export const AUTO_REPLY_MAX_CHARS = 350

export function qualifiesForAutoReply(review: {
  rating: number
  text: string | null
  googleReviewId: string
}): boolean {
  return (
    review.rating === 5 &&
    (review.text === null || review.text.trim() === "") &&
    review.googleReviewId.startsWith("accounts/")
  )
}

/**
 * Reason a draft must NOT go out unattended, or null when it is clean.
 * Pure function so it can be unit tested without a database.
 */
export function autoReplyProblem(
  draft: string,
  authorName: string | null | undefined
): string | null {
  const text = draft.trim()
  if (text.length < AUTO_REPLY_MIN_CHARS) return "too short"
  if (text.length > AUTO_REPLY_MAX_CHARS) return "too long"
  const comp = flagsComp(text)
  if (comp) return `offers a comp ("${comp}")`
  if (/[—–]/.test(text) || /\s-{1,2}\s/.test(text)) return "contains a dash"
  if (/\.{3}|…/.test(text)) return "contains an ellipsis"
  if (/churro/i.test(text)) return 'says "churro"'
  if (/https?:\/\/|www\./i.test(text)) return "contains a link"
  if (/\$\s?\d|\d\s?%/.test(text)) return "mentions a price or percentage"
  if (/\b(sorry|apolog)/i.test(text)) return "apologises on a 5-star review"
  if (/\bplain croissant\b/i.test(text)) return 'says "plain croissant"'
  // A display name like "The" or "User" must not be used as a greeting.
  // Matched case-sensitively as written and only in greeting positions
  // ("Hey The," / "The!" / "Thanks The"), so "the five stars" is fine.
  const name = authorName?.trim()
  if (name && !isUsableName(name)) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const greeting = new RegExp(
      `(?:^|\\b(?:hi|hey|hello|thanks|thank you|cheers|g'day)\\s+)${escaped}\\b|\\b${escaped}[,!]`
    )
    if (greeting.test(text)) return `greets "${name}", which is not a real name`
  }
  return null
}

export type AutoReplyOutcome =
  | { outcome: "posted"; replyText: string }
  | { outcome: "held"; reason: string }

/**
 * Try to post the draft without approval. On any doubt the row is left
 * exactly as it was (DRAFTED with its token) so the normal email covers it.
 */
export async function autoPostReply(review: {
  id: string
  googleReviewId: string
  rating: number
  text: string | null
  authorName: string | null
  replyText: string | null
  draftReply: string | null
}): Promise<AutoReplyOutcome> {
  if (!qualifiesForAutoReply(review)) {
    return { outcome: "held", reason: "not a rating-only 5-star" }
  }
  const draft = scrubReply(review.draftReply ?? "")
  const problem = autoReplyProblem(draft, review.authorName)
  if (problem) return { outcome: "held", reason: problem }

  const guard = await checkAlreadyAnswered(review, draft)
  if (guard.blocked) {
    return {
      outcome: "held",
      reason:
        guard.kind === "already-ours"
          ? "already posted"
          : "already answered on Google from the SEO engine",
    }
  }

  const result = await postGbpReply(review.googleReviewId, draft)
  if (!result.posted) return { outcome: "held", reason: result.reason }

  const now = new Date()
  await db.googleReview.update({
    where: { id: review.id },
    data: {
      replyStatus: "POSTED",
      draftReply: draft,
      replyText: draft,
      approvedAt: now,
      replyPostedAt: now,
      autoApproved: true,
    },
  })
  return { outcome: "posted", replyText: draft }
}
