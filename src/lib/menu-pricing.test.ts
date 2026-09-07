import { test } from "node:test"
import assert from "node:assert/strict"
import { recommendedPrice, recommend } from "./menu-pricing"

test("recommended price hits the target and rounds up to 50c", () => {
  // $6.72 cost at 28% -> $24.00 ex GST -> $26.40 inc -> $26.50
  assert.equal(recommendedPrice(6.72, 28), 26.5)
  // exact landing stays put: $5 cost at 25% -> $20 ex -> $22 inc
  assert.equal(recommendedPrice(5, 25), 22)
  assert.equal(recommendedPrice(0, 30), null)
})

test("recommendation reports the move and the resulting food cost", () => {
  const r = recommend(6.72, 24, 30.8, 28)
  assert.equal(r.recommendedPrice, 26.5)
  assert.equal(r.deltaDollars, 2.5)
  assert.equal(r.resultingFoodCostPct, 27.9)
  assert.equal(r.onTarget, false)
  assert.equal(recommend(6.72, 27, 27.4, 28).onTarget, true)
})
