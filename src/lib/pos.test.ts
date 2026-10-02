import { test } from "node:test"
import assert from "node:assert/strict"
import { isSquareVenueOn, squareCutoverMap } from "./pos"

test("defaults: Currumbin on Square from 1 Oct 2026, Burleigh still Lightspeed", () => {
  assert.equal(isSquareVenueOn("BEACH_HOUSE", "2026-09-30", ""), false)
  assert.equal(isSquareVenueOn("BEACH_HOUSE", "2026-10-01", ""), true)
  assert.equal(isSquareVenueOn("TEA_GARDEN", new Date("2026-10-15"), ""), true)
  assert.equal(isSquareVenueOn("BURLEIGH", "2026-10-15", ""), false)
})

test("SQUARE_CUTOVER env adds Burleigh and can clear a venue", () => {
  const env = JSON.stringify({ BURLEIGH: "2026-10-13", TEA_GARDEN: null })
  assert.equal(isSquareVenueOn("BURLEIGH", "2026-10-13", env), true)
  assert.equal(isSquareVenueOn("BURLEIGH", "2026-10-12", env), false)
  assert.equal(isSquareVenueOn("TEA_GARDEN", "2026-10-13", env), false)
  assert.equal(isSquareVenueOn("BEACH_HOUSE", "2026-10-13", env), true)
})

test("malformed env keeps the defaults", () => {
  assert.deepEqual(squareCutoverMap("not json"), { BEACH_HOUSE: "2026-10-01", TEA_GARDEN: "2026-10-01" })
  assert.deepEqual(squareCutoverMap('{"BURLEIGH":"13/10/2026"}'), { BEACH_HOUSE: "2026-10-01", TEA_GARDEN: "2026-10-01" })
})
