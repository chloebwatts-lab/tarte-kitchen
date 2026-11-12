import { test } from "node:test"
import assert from "node:assert/strict"
import { batchNeedsOwnerEmail, isNegativeRating, reviewHeadline } from "./negative"

test("1 to 3 stars are negative, 4 and 5 are not", () => {
  assert.equal(isNegativeRating(1), true)
  assert.equal(isNegativeRating(2), true)
  assert.equal(isNegativeRating(3), true)
  assert.equal(isNegativeRating(4), false)
  assert.equal(isNegativeRating(5), false)
})

test("review email only when a negative is in the batch", () => {
  assert.equal(batchNeedsOwnerEmail([]), false)
  assert.equal(batchNeedsOwnerEmail([{ rating: 5 }, { rating: 4 }, { rating: 5 }]), false)
  assert.equal(batchNeedsOwnerEmail([{ rating: 5 }, { rating: 3 }]), true)
  assert.equal(batchNeedsOwnerEmail([{ rating: 1 }]), true)
})

test("reviewHeadline counts pending replies and the negatives among them", () => {
  assert.deepEqual(reviewHeadline([]), { reviewsToReply: 0, negativeReviews: 0 })
  assert.deepEqual(reviewHeadline([{ rating: 5 }, { rating: 4 }, { rating: 2 }, { rating: 3 }, { rating: 5 }]), {
    reviewsToReply: 5,
    negativeReviews: 2,
  })
})
