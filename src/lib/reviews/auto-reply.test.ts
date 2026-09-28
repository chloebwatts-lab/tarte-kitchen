import { test } from "node:test"
import assert from "node:assert/strict"
import { autoReplyProblem, qualifiesForAutoReply } from "./auto-reply"

const gbp = "accounts/1/locations/2/reviews/abc"

test("only rating-only 5-star GBP reviews qualify", () => {
  assert.equal(qualifiesForAutoReply({ rating: 5, text: null, googleReviewId: gbp }), true)
  assert.equal(qualifiesForAutoReply({ rating: 5, text: "   ", googleReviewId: gbp }), true)
  assert.equal(qualifiesForAutoReply({ rating: 5, text: "Great food", googleReviewId: gbp }), false)
  assert.equal(qualifiesForAutoReply({ rating: 4, text: null, googleReviewId: gbp }), false)
  assert.equal(qualifiesForAutoReply({ rating: 1, text: null, googleReviewId: gbp }), false)
  assert.equal(
    qualifiesForAutoReply({ rating: 5, text: null, googleReviewId: "places/x/reviews/y" }),
    false
  )
})

test("a clean short thank-you passes", () => {
  assert.equal(
    autoReplyProblem("Thanks so much Emma, lovely to have you at Beach House. See you again soon.", "Emma"),
    null
  )
})

test("anything that needs a human is held", () => {
  const cases: Array<[string, string | null, RegExp]> = [
    ["Thanks!", "Emma", /short/],
    ["x".repeat(400), "Emma", /long/],
    ["Thanks Emma, next coffee is on us.", "Emma", /comp/],
    ["Thanks Emma – see you soon.", "Emma", /dash/],
    ["Thanks Emma - see you soon.", "Emma", /dash/],
    ["Thanks Emma... see you soon.", "Emma", /ellipsis/],
    ["Glad you loved the churro, Emma.", "Emma", /churro/],
    ["Thanks Emma, menu at https://tarte.com.au", "Emma", /link/],
    ["Thanks Emma, brunch from $20 every day.", "Emma", /price/],
    ["Sorry it took a while Emma, thanks for the stars.", "Emma", /apolog/],
    ["Hey The, thanks so much for the five stars, see you soon.", "The", /not a real name/],
  ]
  for (const [draft, name, expect] of cases) {
    const problem = autoReplyProblem(draft, name)
    assert.ok(problem, `expected a problem for: ${draft}`)
    assert.match(problem, expect, draft)
  }
})

test("a non-name that the draft does not use is fine", () => {
  assert.equal(
    autoReplyProblem("Thanks so much for the five stars, lovely to have you at Tarte Burleigh.", "The"),
    null
  )
})

test("edge inputs: empty draft, null author, whitespace text, non-GBP id", () => {
  assert.match(autoReplyProblem("", null) ?? "", /short/)
  assert.match(autoReplyProblem("   ", undefined) ?? "", /short/)
  // Whitespace-only review text counts as rating-only, a single character does not.
  assert.equal(qualifiesForAutoReply({ rating: 5, text: "\n\t ", googleReviewId: gbp }), true)
  assert.equal(qualifiesForAutoReply({ rating: 5, text: ".", googleReviewId: gbp }), false)
  // Places-API rows can never be posted to, whatever the rating.
  assert.equal(qualifiesForAutoReply({ rating: 5, text: null, googleReviewId: "" }), false)
})

test("length boundaries are inclusive at 15 and 350 characters", () => {
  assert.equal("Thanks so much.".length, 15)
  assert.equal(autoReplyProblem("Thanks so much.", null), null)
  assert.match(autoReplyProblem("Thanks so muc.", null) ?? "", /short/)
  const base = "Thanks for the five stars, lovely to have you at Beach House. "
  const at350 = (base.repeat(6) + "x".repeat(350)).slice(0, 350)
  assert.equal(at350.length, 350)
  assert.equal(autoReplyProblem(at350, null), null)
  assert.match(autoReplyProblem(at350 + "x", null) ?? "", /long/)
})

test("comp check does not trip on gluten free or feel free", () => {
  assert.equal(
    autoReplyProblem("Thanks Emma, glad the gluten free almond cruller hit the spot. Feel free to ask for it warm next time at Tarte Burleigh.", "Emma"),
    null
  )
  assert.match(autoReplyProblem("Thanks Emma, a free coffee is waiting for you at Tarte Burleigh.", "Emma") ?? "", /comp/)
})

test("a percentage is held even when it is not a discount", () => {
  assert.match(
    autoReplyProblem("Thanks Emma, everything is 100% made on site at Tarte Burleigh.", "Emma") ?? "",
    /price or percentage/
  )
})

test("non-name greeting check escapes regex characters and catches every greeting shape", () => {
  // "Mr." is not a usable name (only two letters) and contains a regex dot.
  assert.match(autoReplyProblem("Hi Mr., thanks so much for the five stars at Beach House.", "Mr.") ?? "", /not a real name/)
  assert.match(autoReplyProblem("The, thanks so much for the five stars at Beach House.", "The") ?? "", /not a real name/)
  assert.match(autoReplyProblem("Thank you The, lovely to have you at Beach House.", "The") ?? "", /not a real name/)
  assert.match(autoReplyProblem("Lovely to have you at Beach House, User!", "User") ?? "", /not a real name/)
  // A real name is never a problem, and "the" inside a sentence is fine for a "The" reviewer.
  assert.equal(autoReplyProblem("Hey Emma, thanks for the five stars, see you at Beach House soon.", "Emma"), null)
  assert.equal(autoReplyProblem("Thanks for the visit and the five stars, see you at Beach House soon.", "The"), null)
})
