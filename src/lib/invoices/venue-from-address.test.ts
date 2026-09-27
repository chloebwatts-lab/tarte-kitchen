import { test } from "node:test"
import assert from "node:assert/strict"
import { venueFromText, venueFromDeliveryAddress, defaultVenueForSupplier } from "./venue-from-address"

test("venueFromText: concept names beat suburb", () => {
  assert.equal(venueFromText("Tarte Beach House, Pacific Parade, Currumbin QLD 4223"), "BEACH_HOUSE")
  assert.equal(venueFromText("Tarte Market (Tea Garden) Shop 2, Currumbin"), "TEA_GARDEN")
  assert.equal(venueFromText("Tarte Pty Ltd, 1748 Gold Coast Hwy, Burleigh Heads QLD 4220"), "BURLEIGH")
  // Tea Garden wins over Beach House even when both appear (checked first)
  assert.equal(venueFromText("Tea Garden c/o Tarte Beach House"), "TEA_GARDEN")
  // Beach House named but billed via the Burleigh entity: concept first
  assert.equal(venueFromText("Tarte Beach House c/- Tarte Pty Ltd Burleigh"), "BEACH_HOUSE")
})

test("venueFromText: bare Currumbin defaults to Beach House", () => {
  assert.equal(venueFromText("Shop 1, 1 Pacific Pde, Currumbin QLD 4223"), "BEACH_HOUSE")
})

test("venueFromText: case-insensitive", () => {
  assert.equal(venueFromText("burleigh heads"), "BURLEIGH")
  assert.equal(venueFromText("tarte market"), "TEA_GARDEN")
})

test("venueFromText: nothing recognisable is null, never a guess", () => {
  assert.equal(venueFromText("Shop 4, 118 Wharf St, Tweed Heads NSW 2485"), null)
  assert.equal(venueFromText(""), null)
  assert.equal(venueFromText(null), null)
  assert.equal(venueFromText(undefined), null)
})

test("venueFromDeliveryAddress alias is the same function", () => {
  assert.equal(venueFromDeliveryAddress, venueFromText)
})

test("defaultVenueForSupplier: single-venue suppliers by prefix, case-insensitive", () => {
  assert.equal(defaultVenueForSupplier("Paramount Liquor"), "BEACH_HOUSE")
  assert.equal(defaultVenueForSupplier("Paramount Liquor Pty Ltd"), "BEACH_HOUSE")
  assert.equal(defaultVenueForSupplier("PARAMOUNT LIQUOR"), "BEACH_HOUSE")
  assert.equal(defaultVenueForSupplier("Eustralis"), "BURLEIGH")
  assert.equal(defaultVenueForSupplier("Eustralis Food"), "BURLEIGH")
})

test("defaultVenueForSupplier: multi-venue suppliers and empties are null", () => {
  assert.equal(defaultVenueForSupplier("Bidfood"), null)
  assert.equal(defaultVenueForSupplier("Fermex"), null)
  assert.equal(defaultVenueForSupplier("Son of a Bunn"), null)
  assert.equal(defaultVenueForSupplier(""), null)
  assert.equal(defaultVenueForSupplier(null), null)
  assert.equal(defaultVenueForSupplier(undefined), null)
})
