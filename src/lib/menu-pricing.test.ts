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

// ------------------------------------------------ 2026-09-27 gap fills

import { DEFAULT_TARGET_FOOD_COST_PCT, GST_MULTIPLIER, PRICE_STEP } from "./menu-pricing"

test("constants: 10% GST, 50 cent steps, every category target is a sane percentage", () => {
  assert.equal(GST_MULTIPLIER, 1.1)
  assert.equal(PRICE_STEP, 0.5)
  for (const [cat, pct] of Object.entries(DEFAULT_TARGET_FOOD_COST_PCT)) {
    assert.ok(pct > 0 && pct < 100, `${cat} target ${pct}`)
  }
  assert.equal(DEFAULT_TARGET_FOOD_COST_PCT.DRINKS, 22)
  assert.equal(DEFAULT_TARGET_FOOD_COST_PCT.PASTRY, 28)
})

test("nasty inputs return null instead of a price", () => {
  assert.equal(recommendedPrice(-1, 30), null)
  assert.equal(recommendedPrice(6.72, 0), null)
  assert.equal(recommendedPrice(6.72, -30), null)
  assert.equal(recommendedPrice(Number.NaN, 30), null)
  assert.equal(recommendedPrice(6.72, Number.NaN), null)
})

test("a price that lands exactly on a 50c step is not pushed up by float noise", () => {
  // $7.50 at 30%: 25.00 ex, 27.50 inc. In binary floats 7.5 / 0.3 * 1.1 is
  // 27.500000000000004; without the epsilon guard this would round to $28.00.
  assert.equal(recommendedPrice(7.5, 30), 27.5)
  // $3 at 30%: 10 ex, 11 inc
  assert.equal(recommendedPrice(3, 30), 11)
  // $6.6 at 30%: 22 ex, 24.2 inc -> 24.5
  assert.equal(recommendedPrice(6.6, 30), 24.5)
})

test("the $26.90 dish: what it needs to cost to hold 25% and 30%", () => {
  // 26.90 inc = 24.4545 ex; at 25% the cost ceiling is 6.11, at 30% 7.34
  assert.equal(recommendedPrice(6.11, 25), 27)
  assert.equal(recommendedPrice(6.72, 25), 30)
  assert.equal(recommendedPrice(7.34, 30), 27)
  // a 1 cent cost rise over the ceiling tips to the next step
  assert.equal(recommendedPrice(7.35, 30), 27)
  assert.equal(recommendedPrice(7.5, 30), 27.5)
})

test("tiny costs still get a real price (never zero, never negative)", () => {
  assert.equal(recommendedPrice(0.01, 30), 0.5)
  assert.equal(recommendedPrice(0.001, 22), 0.5)
})

test("target over 100% means selling below cost and is still computed", () => {
  // 10 at 200%: 5 ex, 5.5 inc
  assert.equal(recommendedPrice(10, 200), 5.5)
})

test("recommend: a lower recommended price gives a negative delta and correct resulting %", () => {
  // dish at $26.90 costs $6.11 (25%); target 28% -> $24.50
  const r = recommend(6.11, 26.9, 25, 28)
  assert.equal(r.recommendedPrice, 24.5)
  assert.equal(r.deltaDollars, -2.4)
  // 6.11 / (24.5 / 1.1) = 27.43%
  assert.equal(r.resultingFoodCostPct, 27.4)
  assert.equal(r.onTarget, true)
})

test("recommend: null recommendation propagates nulls and is never on target", () => {
  assert.deepEqual(recommend(0, 26.9, 0, 28), {
    targetPct: 28,
    recommendedPrice: null,
    deltaDollars: null,
    resultingFoodCostPct: null,
    onTarget: false,
  })
})

test("recommend: onTarget uses a tiny epsilon so 28.0 is on a 28 target but 28.01 is not", () => {
  assert.equal(recommend(6.72, 26.5, 28, 28).onTarget, true)
  assert.equal(recommend(6.72, 26.5, 28.01, 28).onTarget, false)
  assert.equal(recommend(6.72, 26.5, 0, 28).onTarget, true)
})

test("recommend: delta is rounded to cents", () => {
  const r = recommend(6.72, 24.123, 30.8, 28)
  assert.equal(r.recommendedPrice, 26.5)
  assert.equal(r.deltaDollars, 2.38)
})
