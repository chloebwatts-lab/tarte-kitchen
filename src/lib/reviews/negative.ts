/**
 * Which Google reviews count as negative, and the counts Chloe's daily
 * headline email shows. Pure (no db), tested in negative.test.ts.
 *
 * Chloe, 12 Nov 2026: only vital emails; folded into the 17:00 Tarte today
 * email. The 08:00 review email now goes out only when a negative review is
 * waiting; positives stay on /reviews and are counted via
 * /api/internal/owner-headlines.
 */

/** 1 to 3 stars, the same line the review email has always drawn ("need attention"). */
export function isNegativeRating(rating: number): boolean {
  return rating <= 3
}

/** True when the batch has at least one negative review, i.e. worth an email to Chloe. */
export function batchNeedsOwnerEmail(reviews: { rating: number }[]): boolean {
  return reviews.some((r) => isNegativeRating(r.rating))
}

/** Pending replies on /reviews: how many, and how many of those are negative. */
export function reviewHeadline(pending: { rating: number }[]): { reviewsToReply: number; negativeReviews: number } {
  return {
    reviewsToReply: pending.length,
    negativeReviews: pending.filter((r) => isNegativeRating(r.rating)).length,
  }
}
