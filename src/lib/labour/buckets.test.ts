import { test } from "node:test"
import assert from "node:assert/strict"
import {
  bucketFor,
  bucketStatus,
  bucketTargets,
  TG_PASTRY_REVENUE_SHARE,
  type Bucket,
  type BucketTarget,
} from "./buckets"

// ------------------------------------------------------------ bucketFor

test("Burleigh Deputy areas map to the three dept buckets", () => {
  const cases: Array<[string, Bucket]> = [
    ["Kitchen", "chefsKp"],
    ["KP", "chefsKp"],
    ["PREP", "chefsKp"],
    ["Salary BOH BURLEIGH", "chefsKp"],
    ["FOH", "fohBarista"],
    ["Barista", "fohBarista"],
    ["Juice Bar", "fohBarista"],
    ["Takeaway Area", "fohBarista"],
    ["Salary FOH BURLEIGH", "fohBarista"],
    ["Pastry", "pastry"],
    ["Salary PASTRY BURLEIGH", "pastry"],
  ]
  for (const [area, want] of cases) {
    assert.equal(bucketFor("BURLEIGH", area), want, area)
  }
})

test("Beach House areas: cafe + restaurant kitchens and KPs all land in chefsKp", () => {
  for (const area of ["Restaurant Kitchen", "Restaurant KP", "Cafe Kitchen", "Cafe KP", "Food Prep", "Salary Chef Currumbin"]) {
    assert.equal(bucketFor("BEACH_HOUSE", area), "chefsKp", area)
  }
})

test("Beach House FOH, bar, coffee, juice bar and functions are one FOH bucket", () => {
  for (const area of ["Restaurant FOH", "Restaurant Bar", "Restaurant Coffee", "Cafe FOH", "Cafe Coffee", "Cafe Juice Bar", "Function", "Salary Currumbin FOH"]) {
    assert.equal(bucketFor("BEACH_HOUSE", area), "fohBarista", area)
  }
  assert.equal(bucketFor("BEACH_HOUSE", "Pastry"), "pastry")
  assert.equal(bucketFor("BEACH_HOUSE", "Salary Pastry Currumbin"), "pastry")
})

test("Juice bar is FOH at both venues (Louise codes it FOH, recode agrees)", () => {
  assert.equal(bucketFor("BURLEIGH", "Juice Bar"), "fohBarista")
  assert.equal(bucketFor("BEACH_HOUSE", "Cafe Juice Bar"), "fohBarista")
})

test("Tea Garden only maps its FOH; kitchen is shared with Beach House", () => {
  assert.equal(bucketFor("TEA_GARDEN", "TG FOH"), "fohBarista")
  assert.equal(bucketFor("TEA_GARDEN", "Kitchen"), "other")
  assert.equal(bucketFor("TEA_GARDEN", "Pastry"), "other")
})

test("areas are venue-scoped: a Beach House area name at Burleigh is 'other'", () => {
  assert.equal(bucketFor("BURLEIGH", "Cafe FOH"), "other")
  assert.equal(bucketFor("BURLEIGH", "Restaurant Kitchen"), "other")
  assert.equal(bucketFor("BEACH_HOUSE", "KP"), "other")
  assert.equal(bucketFor("BEACH_HOUSE", "Takeaway Area"), "other")
})

test("null, empty and unknown areas fall to 'other'", () => {
  assert.equal(bucketFor("BURLEIGH", null), "other")
  assert.equal(bucketFor("BURLEIGH", ""), "other")
  assert.equal(bucketFor("BURLEIGH", "Admin"), "other")
  assert.equal(bucketFor("BURLEIGH", "Open"), "other")
})

test("area match is exact and case-sensitive, matching Deputy names as synced", () => {
  assert.equal(bucketFor("BURLEIGH", "kitchen"), "other")
  assert.equal(bucketFor("BURLEIGH", "Kitchen "), "other")
  assert.equal(bucketFor("BURLEIGH", "foh"), "other")
})

test("the BOTH pseudo-venue has no area map", () => {
  assert.equal(bucketFor("BOTH", "Kitchen"), "other")
  assert.equal(bucketFor("BOTH", "FOH"), "other")
})

// -------------------------------------------------------- bucketTargets

test("Burleigh bands match the dept wage targets (11.5-12 / 20.5-21 / 4.75-5.25)", () => {
  const t = bucketTargets("BURLEIGH")
  assert.deepEqual(
    t.map((x) => [x.key, x.min, x.max]),
    [
      ["chefsKp", 11.5, 12.0],
      ["fohBarista", 20.5, 21.0],
      ["pastry", 4.75, 5.25],
    ]
  )
  // Whole-venue dept wage band, top of bands, is 38.25%: the GM tile
  // grades the venue at 38% or under.
  const topSum = t.reduce((s, x) => s + x.max, 0)
  assert.ok(Math.abs(topSum - 38.25) < 1e-9, `top of bands sum ${topSum}`)
})

test("Beach House bands match (12.5-13.5 / 21.5-22.5 / 2.5-3.0)", () => {
  const t = bucketTargets("BEACH_HOUSE")
  assert.deepEqual(
    t.map((x) => [x.key, x.min, x.max]),
    [
      ["chefsKp", 12.5, 13.5],
      ["fohBarista", 21.5, 22.5],
      ["pastry", 2.5, 3.0],
    ]
  )
})

test("every configured band has min < max and a label", () => {
  for (const venue of ["BURLEIGH", "BEACH_HOUSE"] as const) {
    for (const t of bucketTargets(venue)) {
      assert.ok(t.min < t.max, `${venue} ${t.key}`)
      assert.ok(t.label.length > 0)
      assert.ok(t.min > 0)
    }
  }
})

test("Tea Garden and BOTH have no bands (cards hidden)", () => {
  assert.deepEqual(bucketTargets("TEA_GARDEN"), [])
  assert.deepEqual(bucketTargets("BOTH"), [])
})

test("no venue ever gets a target for the 'other' bucket", () => {
  for (const venue of ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN", "BOTH"] as const) {
    assert.ok(bucketTargets(venue).every((t) => t.key !== "other"), venue)
  }
})

// --------------------------------------------------------- bucketStatus

const chefs: BucketTarget = { key: "chefsKp", label: "Chefs + KP", min: 11.5, max: 12.0 }

test("under or at the band max is ok (under-band is a win, not a flag)", () => {
  assert.equal(bucketStatus(0, chefs), "ok")
  assert.equal(bucketStatus(9.1, chefs), "ok")
  assert.equal(bucketStatus(11.5, chefs), "ok")
  assert.equal(bucketStatus(12.0, chefs), "ok")
})

test("amber within 0.5pp over the max, red beyond", () => {
  assert.equal(bucketStatus(12.01, chefs), "amber")
  assert.equal(bucketStatus(12.5, chefs), "amber")
  assert.equal(bucketStatus(12.51, chefs), "red")
  assert.equal(bucketStatus(44.3, chefs), "red")
})

test("floating point sums right on the amber edge stay amber", () => {
  // 0.1 + 0.2 style drift: 12.0 + 0.5 computed the long way.
  const pct = 11.7 + 0.8 // 12.499999999999998 or 12.5, either way amber
  assert.equal(bucketStatus(pct, chefs), "amber")
})

test("Beach House pastry band graded on its own max", () => {
  const pastry: BucketTarget = { key: "pastry", label: "Pastry", min: 2.5, max: 3.0 }
  assert.equal(bucketStatus(3.0, pastry), "ok")
  assert.equal(bucketStatus(3.4, pastry), "amber")
  assert.equal(bucketStatus(3.6, pastry), "red")
})

test("missing pct or missing target is no-target, never a colour", () => {
  assert.equal(bucketStatus(null, chefs), "no-target")
  assert.equal(bucketStatus(12.4, null), "no-target")
  assert.equal(bucketStatus(null, null), "no-target")
})

test("negative pct (credit / correction week) is ok, not an error", () => {
  assert.equal(bucketStatus(-2.3, chefs), "ok")
})

test("NaN or Infinity pct (zero-revenue division upstream) grades red, so callers must guard revenue > 0", () => {
  // Documents current behaviour: NaN fails every comparison and falls to red.
  assert.equal(bucketStatus(Number.NaN, chefs), "red")
  assert.equal(bucketStatus(Number.POSITIVE_INFINITY, chefs), "red")
})

// --------------------------------------------- TG pastry revenue credit

test("Beach House pastry gets half of Tea Garden revenue in its denominator", () => {
  assert.equal(TG_PASTRY_REVENUE_SHARE, 0.5)
  // Worked example: BH rev $60,000 ex GST, TG rev $8,500, pastry wages $2,200.
  // 2200/60000 = 3.67% (red) but 2200/64250 = 3.42% (amber).
  const bhRev = 60000
  const tgRev = 8500
  const pastry = 2200
  const denom = bhRev + tgRev * TG_PASTRY_REVENUE_SHARE
  assert.equal(denom, 64250)
  const pct = (pastry / denom) * 100
  const bhOnlyPct = (pastry / bhRev) * 100
  assert.ok(pct < bhOnlyPct)
  assert.equal(bucketStatus(pct, bucketTargets("BEACH_HOUSE")[2]), "amber")
  assert.equal(bucketStatus(bhOnlyPct, bucketTargets("BEACH_HOUSE")[2]), "red")
})
