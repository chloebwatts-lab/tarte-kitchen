import { test } from "node:test"
import assert from "node:assert/strict"
import { venueFromText, venueFromDeliveryAddress, defaultVenueForSupplier, venueHintFromEmail } from "./venue-from-address"

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
  assert.equal(defaultVenueForSupplier("Tasman Distribution"), "BEACH_HOUSE")
})

test("defaultVenueForSupplier: multi-venue suppliers and empties are null", () => {
  assert.equal(defaultVenueForSupplier("Bidfood"), null)
  assert.equal(defaultVenueForSupplier("Fermex"), null)
  assert.equal(defaultVenueForSupplier("Son of a Bunn"), null)
  assert.equal(defaultVenueForSupplier(""), null)
  assert.equal(defaultVenueForSupplier(null), null)
  assert.equal(defaultVenueForSupplier(undefined), null)
})

// ---------------------------------------------------------- venueHintFromEmail

test("Parallel Roasters: subject from accounts@parallelroasters.com names the venue", () => {
  assert.deepEqual(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", "Tarte Beachouse"), {
    venue: "BEACH_HOUSE",
    source: "subject",
  })
  assert.deepEqual(venueHintFromEmail("Parallel Roasters", "Accounts@ParallelRoasters.com ", "Beachouse payment"), {
    venue: "BEACH_HOUSE",
    source: "subject",
  })
  assert.deepEqual(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", "Tarte"), {
    venue: "BURLEIGH",
    source: "subject",
  })
  assert.deepEqual(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", "Tarte Payment"), {
    venue: "BURLEIGH",
    source: "subject",
  })
  // a subject that names neither stays manual
  assert.equal(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", "Statement"), null)
})

test("Parallel Roasters via Unleashed is Burleigh, as a weak (sender) hint", () => {
  assert.deepEqual(
    venueHintFromEmail("Parallel Roasters", "noreply@unleashedsoftware.com", "Tax Invoice: SI-00009537 from Parallel Roasters"),
    { venue: "BURLEIGH", source: "sender" }
  )
})

test("venueHintFromEmail: other suppliers and other senders give no hint", () => {
  assert.equal(venueHintFromEmail("Bidfood", "accounts@parallelroasters.com", "Tarte Beachouse"), null)
  assert.equal(venueHintFromEmail("Parallel Roasters", "messaging-service@post.xero.com", "Tarte Beachouse"), null)
  assert.equal(venueHintFromEmail(null, null, null), null)
})

test("venueHintFromEmail: supplier match is a case-insensitive prefix, sender is case- and space-tolerant", () => {
  // the DB name may carry a legal suffix; a name that merely contains the words is not Parallel Roasters
  assert.deepEqual(
    venueHintFromEmail("Parallel Roasters Pty Ltd", "accounts@parallelroasters.com", "Tarte Beachouse"),
    { venue: "BEACH_HOUSE", source: "subject" }
  )
  assert.deepEqual(
    venueHintFromEmail("PARALLEL ROASTERS", " NoReply@UnleashedSoftware.com ", "Tax Invoice: SI-00009541 from Parallel Roasters"),
    { venue: "BURLEIGH", source: "sender" }
  )
  assert.equal(venueHintFromEmail("Not Parallel Roasters", "noreply@unleashedsoftware.com", "Tarte"), null)
})

test("venueHintFromEmail: every spelling of Currumbin in an accounts@ subject beats the Tarte fallback", () => {
  for (const subj of ["Tarte Beach House", "Tarte BEACHOUSE invoice", "Invoice Tarte Currumbin", "beach  house"]) {
    assert.deepEqual(
      venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", subj),
      { venue: "BEACH_HOUSE", source: "subject" },
      subj
    )
  }
  assert.deepEqual(
    venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", "Burleigh invoice"),
    { venue: "BURLEIGH", source: "subject" }
  )
})

test("venueHintFromEmail: a blank subject from accounts@ gives no hint, Unleashed never needs one", () => {
  assert.equal(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", ""), null)
  assert.equal(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", null), null)
  assert.equal(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com", undefined), null)
  assert.deepEqual(venueHintFromEmail("Parallel Roasters", "noreply@unleashedsoftware.com", null), {
    venue: "BURLEIGH",
    source: "sender",
  })
  // a look-alike domain is not the sender
  assert.equal(venueHintFromEmail("Parallel Roasters", "accounts@parallelroasters.com.evil.com", "Tarte Beachouse"), null)
  assert.equal(venueHintFromEmail("Parallel Roasters", "someone@unleashedsoftware.com", "Tarte"), null)
})
