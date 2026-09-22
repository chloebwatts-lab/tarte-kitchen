/**
 * Cross-system guard: never post an owner reply over one that is already
 * live on Google.
 *
 * Two systems reply to the same Google reviews:
 *   - this app      , daily draft email + the /reviews page
 *   - tarte-seo-engine , its own dashboard + hourly publish sweep
 *
 * GBP's reply endpoint is a PUT upsert, so whichever posts second
 * silently REPLACES the other's reply, and Chloe never sees it happen.
 * That is exactly what happened to the 1-star Beach House review from
 * 6 Sep 2026: the seo engine replied on 11 Sep, this app replied with
 * different wording on 23 Sep and wiped it.
 *
 * Every approve path calls `checkAlreadyAnswered` before posting. It
 * asks Google what is live right now, and falls back to the synced
 * `replyText` mirror when the API can't answer.
 */

import { db } from "@/lib/db"
import { fetchLiveGbpReply } from "@/lib/gbp/post-reply"

/** Collapse whitespace so trivial formatting differences don't read as a different reply. */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim()
}

export type AlreadyAnsweredCheck =
  /** Nothing live on Google, safe to post. */
  | { blocked: false }
  /** A reply is live and it is not the text we are about to post. */
  | { blocked: true; kind: "answered-elsewhere"; liveComment: string }
  /** A reply is live and it matches ours, so our earlier post did land. */
  | { blocked: true; kind: "already-ours"; liveComment: string }

/**
 * Decide whether posting `finalText` to this review would overwrite
 * someone else's reply.
 *
 * Side effect: when a reply is already live, the row's status is
 * corrected so it leaves the pending queue (ANSWERED_ELSEWHERE, or
 * POSTED when the live reply is the one we approved earlier and a
 * failed post left the row stuck on APPROVED).
 */
export async function checkAlreadyAnswered(review: {
  id: string
  googleReviewId: string
  replyText: string | null
  draftReply?: string | null
}, finalText: string): Promise<AlreadyAnsweredCheck> {
  const live = await fetchLiveGbpReply(review.googleReviewId)

  // Fall back to the mirror the review sync writes when GBP can't tell us.
  const liveComment = live.unknown ? review.replyText : live.comment
  if (!liveComment) return { blocked: false }

  const ours =
    normalise(liveComment) === normalise(finalText) ||
    (review.draftReply != null &&
      normalise(liveComment) === normalise(review.draftReply))

  await db.googleReview.update({
    where: { id: review.id },
    data: ours
      ? {
          replyStatus: "POSTED",
          replyPostedAt: new Date(),
          replyText: liveComment,
        }
      : {
          replyStatus: "ANSWERED_ELSEWHERE",
          replyText: liveComment,
        },
  })

  return ours
    ? { blocked: true, kind: "already-ours", liveComment }
    : { blocked: true, kind: "answered-elsewhere", liveComment }
}
