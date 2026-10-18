import { test } from "node:test"
import assert from "node:assert/strict"
import { LIGHTSPEED_AVG_SALE, vsLightspeedPct } from "./benchmarks"

test("vsLightspeedPct: Shawna's Lightspeed yardsticks, 1dp either side", () => {
  assert.deepEqual(LIGHTSPEED_AVG_SALE, { CAFE: 25.05, ONLINE: 36.3, RESTAURANT: 82.03 })
  // Register 2 at $27.56 a head is 10.0% up on the cafe's $25.05
  assert.equal(vsLightspeedPct("CAFE", 27.56, 180), 10)
  // Restaurant at $70 a head is 14.7% down on $82.03
  assert.equal(vsLightspeedPct("RESTAURANT", 70, 40), -14.7)
  // Bopple at the Lightspeed average is 0
  assert.equal(vsLightspeedPct("ONLINE", 36.3, 12), 0)
  // Rounds to one decimal place
  assert.equal(vsLightspeedPct("CAFE", 25.05 * 1.12345, 10), 12.3)
})

test("vsLightspeedPct: no orders means no arrow; zero average with orders is a full drop", () => {
  assert.equal(vsLightspeedPct("CAFE", 0, 0), null)
  assert.equal(vsLightspeedPct("RESTAURANT", 82.03, -1), null)
  assert.equal(vsLightspeedPct("CAFE", 0, 3), -100)
})
