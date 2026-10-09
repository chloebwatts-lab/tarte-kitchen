import { test } from "node:test"
import assert from "node:assert/strict"
import { bucketFor } from "./buckets"

// The "Salary <area>" fallback added for Tarte Shifts roll-ups: it must
// inherit the area's bucket without ever guessing, and the Deputy-era card
// names must keep their explicit mapping.

test("prefix is matched case-insensitively and with any whitespace, the area itself stays exact", () => {
  assert.equal(bucketFor("BURLEIGH", "SALARY Kitchen"), "chefsKp")
  assert.equal(bucketFor("BURLEIGH", "salary Kitchen"), "chefsKp")
  assert.equal(bucketFor("BURLEIGH", "Salary  Kitchen"), "chefsKp") // double space
  assert.equal(bucketFor("BURLEIGH", "Salary\tKitchen"), "chefsKp")
  assert.equal(bucketFor("BURLEIGH", "salary kitchen"), "other") // area names are case-sensitive, as synced
  assert.equal(bucketFor("BURLEIGH", "Salary Kitchen "), "other") // trailing space never matched (mapper trims first)
})

test("degenerate Salary names fall to other, never throw or loop", () => {
  for (const area of ["Salary", "Salary ", "Salary   ", "SALARY", "Salary Salary Kitchen", "Kitchen Salary", "Salaryman Kitchen", "Salaried Kitchen"]) {
    assert.equal(bucketFor("BURLEIGH", area), "other", JSON.stringify(area))
  }
})

test("fallback is venue-scoped like the direct map", () => {
  assert.equal(bucketFor("BURLEIGH", "Salary Juice Bar"), "fohBarista")
  assert.equal(bucketFor("BURLEIGH", "Salary Takeaway Area"), "fohBarista")
  assert.equal(bucketFor("BURLEIGH", "Salary PREP"), "chefsKp")
  assert.equal(bucketFor("BURLEIGH", "Salary Cafe FOH"), "other")
  assert.equal(bucketFor("BEACH_HOUSE", "Salary Function"), "fohBarista")
  assert.equal(bucketFor("BEACH_HOUSE", "Salary Restaurant KP"), "chefsKp")
  assert.equal(bucketFor("BEACH_HOUSE", "Salary KP"), "other")
  assert.equal(bucketFor("TEA_GARDEN", "Salary Kitchen"), "other")
  assert.equal(bucketFor("TEA_GARDEN", "Salary TG FOH"), "fohBarista")
  assert.equal(bucketFor("TEA_GARDEN", "Salary TG Pastry"), "pastry")
  assert.equal(bucketFor("BOTH", "Salary Kitchen"), "other")
})

test("the OTHER placeholder names stay in other at every venue (admin salary never leaks into a dept band)", () => {
  assert.equal(bucketFor("BURLEIGH", "Salary OTHER BURLEIGH"), "other")
  assert.equal(bucketFor("BEACH_HOUSE", "Salary Other Currumbin"), "other")
  assert.equal(bucketFor("TEA_GARDEN", "Salary TG Other"), "other")
})

test("fallback does not change any Deputy-era card: direct map wins and strip-then-lookup gives the same answer", () => {
  const cards: Array<[Parameters<typeof bucketFor>[0], string, string]> = [
    ["BURLEIGH", "Salary BOH BURLEIGH", "chefsKp"],
    ["BURLEIGH", "Salary FOH BURLEIGH", "fohBarista"],
    ["BURLEIGH", "Salary PASTRY BURLEIGH", "pastry"],
    ["BEACH_HOUSE", "Salary Chef Currumbin", "chefsKp"],
    ["BEACH_HOUSE", "Salary Currumbin FOH", "fohBarista"],
    ["BEACH_HOUSE", "Salary Pastry Currumbin", "pastry"],
  ]
  for (const [venue, area, want] of cards) assert.equal(bucketFor(venue, area), want, area)
})
