import { test } from "node:test"
import assert from "node:assert/strict"
import { normalizeVenueSlug, SINGLE_VENUES, VENUE_LABEL, VENUE_SHORT_LABEL } from "./venues"

test("exact enum values and spaced variants", () => {
  assert.equal(normalizeVenueSlug("BURLEIGH"), "BURLEIGH")
  assert.equal(normalizeVenueSlug("beach_house"), "BEACH_HOUSE")
  assert.equal(normalizeVenueSlug(" Beach House "), "BEACH_HOUSE")
  assert.equal(normalizeVenueSlug("tea garden"), "TEA_GARDEN")
  assert.equal(normalizeVenueSlug("TEA_GARDEN"), "TEA_GARDEN")
})

test("legacy CURRUMBIN maps to Beach House", () => {
  assert.equal(normalizeVenueSlug("CURRUMBIN"), "BEACH_HOUSE")
  assert.equal(normalizeVenueSlug("Tarte Currumbin"), "BEACH_HOUSE")
})

test("Lightspeed company / location names", () => {
  assert.equal(normalizeVenueSlug("Tarte Burleigh"), "BURLEIGH")
  assert.equal(normalizeVenueSlug("Tarte Bakery"), "BURLEIGH")
  assert.equal(normalizeVenueSlug("Tarte Pty Ltd"), "BURLEIGH")
  assert.equal(normalizeVenueSlug("Tarte Pty. Ltd."), "BURLEIGH")
  assert.equal(normalizeVenueSlug("Tarte Market"), "TEA_GARDEN")
  assert.equal(normalizeVenueSlug("Tarte Beach House"), "BEACH_HOUSE")
  assert.equal(normalizeVenueSlug("TarteBeachHouse"), "BEACH_HOUSE")
})

test("Tea Garden outranks Beach House and Currumbin when both appear", () => {
  assert.equal(normalizeVenueSlug("Tarte Beach House - Tea Garden"), "TEA_GARDEN")
  assert.equal(normalizeVenueSlug("Tea Garden Currumbin"), "TEA_GARDEN")
})

test("Beach House outranks a stray Burleigh mention", () => {
  assert.equal(normalizeVenueSlug("Beach House (ex Burleigh stock)"), "BEACH_HOUSE")
})

test("null, undefined, empty and unknown strings return null", () => {
  assert.equal(normalizeVenueSlug(null), null)
  assert.equal(normalizeVenueSlug(undefined), null)
  assert.equal(normalizeVenueSlug(""), null)
  assert.equal(normalizeVenueSlug("   "), null)
  assert.equal(normalizeVenueSlug("Mermaid Beach"), null)
  assert.equal(normalizeVenueSlug("BOTH"), null)
})

test("Currumbin legal entity name resolves to Beach House, bakery legal name to Burleigh", () => {
  assert.equal(normalizeVenueSlug("Tarte Currumbin Pty Ltd"), "BEACH_HOUSE")
  assert.equal(normalizeVenueSlug("Tarte Pty Ltd"), "BURLEIGH")
})

test("SINGLE_VENUES never includes BOTH and every venue has both labels", () => {
  assert.deepEqual([...SINGLE_VENUES], ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"])
  for (const v of SINGLE_VENUES) {
    assert.ok(VENUE_LABEL[v].length > 0)
    assert.ok(VENUE_SHORT_LABEL[v].length > 0)
    assert.equal(normalizeVenueSlug(VENUE_LABEL[v]), v, `label round-trips for ${v}`)
    assert.equal(normalizeVenueSlug(VENUE_SHORT_LABEL[v]), v, `short label round-trips for ${v}`)
  }
})
