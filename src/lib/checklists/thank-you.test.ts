import { test } from "node:test"
import assert from "node:assert/strict"
import { getsThankYou, isOurCloudinaryUrl, photoPool, photoSiteOf, pickOne, thankYouDisplayUrl } from "./thank-you"

const t = (area: string | null, name: string, cadence = "DAILY", isFoodSafety = false) => ({ area, name, cadence, isFoodSafety })

test("Oliver 17 Nov: every department's daily, weekly and monthly lists get the thank-you page", () => {
  // Burleigh, from the live template list.
  assert.equal(getsThankYou(t("Market", "Market — Daily Clean")), true)
  assert.equal(getsThankYou(t("FOH", "FOH — Daily Tasks")), true)
  assert.equal(getsThankYou(t("KP", "KP — Daily Close")), true)
  assert.equal(getsThankYou(t("Kitchen", "Chefs — Daily Clean")), true)
  assert.equal(getsThankYou(t("Pastry", "Pastry — Daily Clean")), true)
  assert.equal(getsThankYou(t("Food Safety", "Pest Activity Log")), true)
  assert.equal(getsThankYou(t("Food Safety", "Temperature Check — AM", "DAILY", true)), true)
  assert.equal(getsThankYou(t("Barista", "Barista — Weekly Deep Clean", "WEEKLY")), true)
  assert.equal(getsThankYou(t("Pastry", "Pastry — Monthly Deep Clean", "MONTHLY")), true)
  // Currumbin (Beach House + Tea Garden).
  assert.equal(getsThankYou(t("Restaurant Kitchen", "Restaurant Kitchen — Daily Clean")), true)
  assert.equal(getsThankYou(t("Cafe Kitchen", "Cafe Kitchen — Weekly Deep Clean", "WEEKLY")), true)
  assert.equal(getsThankYou(t("QC & Standards", "QC — Records & Sign-offs (Lola)")), true)
  assert.equal(getsThankYou(t("Bar", "Bar — Closing Clean")), true)
  assert.equal(getsThankYou(t("FOH", "Opening")), true)
  assert.equal(getsThankYou(t(null, "Anything")), true)
})

test("on-demand records (deliveries, cooling) finish without one", () => {
  assert.equal(getsThankYou(t("Food Safety", "Delivery Temperature Check", "ON_DEMAND", true)), false)
  assert.equal(getsThankYou(t("Food Safety", "Cooling Log", "ON_DEMAND", true)), false)
  assert.equal(getsThankYou(t("FOH", "FOH — Daily Tasks", "ON_DEMAND")), false)
  assert.equal(getsThankYou(t("FOH", "FOH — Daily Tasks", "")), false)
})

test("pickOne spreads over the pool and copes with an empty one", () => {
  assert.equal(pickOne([], 0.5), null)
  assert.equal(pickOne(["a", "b", "c"], 0), "a")
  assert.equal(pickOne(["a", "b", "c"], 0.5), "b")
  assert.equal(pickOne(["a", "b", "c"], 0.9999), "c")
  assert.equal(pickOne(["a", "b", "c"], 1), "c")
})

test("only our own Cloudinary image URLs are accepted", () => {
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte/image/upload/v1/x.jpg", "tarte"), true)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/other/image/upload/v1/x.jpg", "tarte"), false)
  assert.equal(isOurCloudinaryUrl("http://res.cloudinary.com/tarte/image/upload/v1/x.jpg", "tarte"), false)
  assert.equal(isOurCloudinaryUrl("https://evil.example/tarte/image/upload/x.jpg", "tarte"), false)
  assert.equal(isOurCloudinaryUrl("not a url", "tarte"), false)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte/image/upload/x.jpg", undefined), false)
})

test("pickOne never falls off either end of the pool", () => {
  assert.equal(pickOne(["only"], 0.73), "only")
  assert.equal(pickOne(["a", "b", "c"], -0.2), "a")
  assert.equal(pickOne(["a", "b", "c"], 5), "c")
  const pool = ["a", "b", "c", "d"]
  for (let i = 0; i < 200; i++) assert.ok(pool.includes(pickOne(pool) as string))
})

test("Cloudinary guard rejects lookalike hosts, other accounts and non-image uploads", () => {
  const cloud = "tarte"
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com.evil.example/tarte/image/upload/x.jpg", cloud), false)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com@evil.example/tarte/image/upload/x.jpg", cloud), false)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte-other/image/upload/x.jpg", cloud), false)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte/image/upload/../../other/image/upload/x.jpg", cloud), false)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte/video/upload/x.mp4", cloud), false)
  assert.equal(isOurCloudinaryUrl("javascript:alert(1)", cloud), false)
  assert.equal(isOurCloudinaryUrl("", cloud), false)
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte/image/upload/x.jpg", ""), false)
  // Real secure_url shape from the upload preset, folder included.
  assert.equal(isOurCloudinaryUrl("https://res.cloudinary.com/tarte/image/upload/v1731380000/tarte-kitchen/thank-you/abc123.jpg", cloud), true)
})

test("photoSiteOf: Burleigh on its own, Beach House and Tea Garden are Currumbin", () => {
  assert.equal(photoSiteOf("BURLEIGH"), "BURLEIGH")
  assert.equal(photoSiteOf("BEACH_HOUSE"), "CURRUMBIN")
  assert.equal(photoSiteOf("TEA_GARDEN"), "CURRUMBIN")
  assert.equal(photoSiteOf("CURRUMBIN"), "CURRUMBIN")
  assert.equal(photoSiteOf(" beach_house "), "CURRUMBIN")
  assert.equal(photoSiteOf("BOTH"), null)
  assert.equal(photoSiteOf(undefined), null)
  assert.equal(photoSiteOf(""), null)
})

test("photoPool: the site's own photos first, otherwise every venue's", () => {
  const all = [
    { venue: "BURLEIGH", url: "b1" },
    { venue: "BURLEIGH", url: "b2" },
  ]
  assert.deepEqual(photoPool(all, "BURLEIGH").map((p) => p.url), ["b1", "b2"])
  // Currumbin has none of its own yet: Beach House and Tea Garden borrow the whole pool.
  assert.deepEqual(photoPool(all, "BEACH_HOUSE").map((p) => p.url), ["b1", "b2"])
  assert.deepEqual(photoPool(all, "TEA_GARDEN").map((p) => p.url), ["b1", "b2"])
  assert.deepEqual(photoPool([], "BURLEIGH"), [])
  // Once Oliver adds Currumbin photos, both Currumbin venues use only those,
  // and Burleigh never shows them.
  const withCurrumbin = [...all, { venue: "BEACH_HOUSE", url: "c1" }, { venue: "TEA_GARDEN", url: "t1" }]
  assert.deepEqual(photoPool(withCurrumbin, "BEACH_HOUSE").map((p) => p.url), ["c1", "t1"])
  assert.deepEqual(photoPool(withCurrumbin, "TEA_GARDEN").map((p) => p.url), ["c1", "t1"])
  assert.deepEqual(photoPool(withCurrumbin, "BURLEIGH").map((p) => p.url), ["b1", "b2"])
  // A site with photos never borrows: Burleigh empty, Currumbin full.
  assert.deepEqual(photoPool([{ venue: "BEACH_HOUSE", url: "c1" }], "BURLEIGH").map((p) => p.url), ["c1"])
  // The caller's list is never changed.
  const pool = photoPool(all, "BEACH_HOUSE")
  pool.pop()
  assert.equal(all.length, 2)
})

test("thankYouDisplayUrl asks Cloudinary for a lighter copy, once, and leaves other URLs alone", () => {
  const raw = "https://res.cloudinary.com/tarte/image/upload/v1794530594/tarte-kitchen/thank-you/abc.jpg"
  const small = "https://res.cloudinary.com/tarte/image/upload/f_auto,q_auto,c_limit,h_1400/v1794530594/tarte-kitchen/thank-you/abc.jpg"
  assert.equal(thankYouDisplayUrl(raw), small)
  assert.equal(thankYouDisplayUrl(small), small)
  assert.equal(thankYouDisplayUrl("https://example.com/image/upload/x.jpg"), "https://example.com/image/upload/x.jpg")
  assert.equal(thankYouDisplayUrl("https://res.cloudinary.com/tarte/video/upload/x.mp4"), "https://res.cloudinary.com/tarte/video/upload/x.mp4")
  assert.equal(thankYouDisplayUrl(""), "")
})

test("test-guard: a BOTH-venue run borrows the whole pool and gets a real, lighter photo", () => {
  // Mirrors pickThankYouPhotoUrl: pool, pick, then the display URL.
  const rows = [
    { venue: "BURLEIGH", url: "https://res.cloudinary.com/tarte/image/upload/v1794530594/tarte-kitchen/thank-you/b1.jpg" },
    { venue: "TEA_GARDEN", url: "https://res.cloudinary.com/tarte/image/upload/v1794530595/tarte-kitchen/thank-you/t1.jpg" },
  ]
  const pool = photoPool(rows, "BOTH")
  assert.equal(pool.length, 2)
  const last = pickOne(pool, 0.9999)
  assert.ok(last)
  assert.equal(
    thankYouDisplayUrl(last.url),
    "https://res.cloudinary.com/tarte/image/upload/f_auto,q_auto,c_limit,h_1400/v1794530595/tarte-kitchen/thank-you/t1.jpg",
  )
  // A site with one photo of its own never shows another site's.
  for (const r of [0, 0.5, 0.9999]) assert.equal(pickOne(photoPool(rows, "TEA_GARDEN"), r)?.url, rows[1].url)
  for (const r of [0, 0.5, 0.9999]) assert.equal(pickOne(photoPool(rows, "BEACH_HOUSE"), r)?.url, rows[1].url)
})

test("test-guard: thankYouDisplayUrl leaves lookalike hosts and plain http alone", () => {
  const lookalike = "https://res.cloudinary.com.evil.example/tarte/image/upload/x.jpg"
  assert.equal(thankYouDisplayUrl(lookalike), lookalike)
  const http = "http://res.cloudinary.com/tarte/image/upload/v1/x.jpg"
  assert.equal(thankYouDisplayUrl(http), http)
  // Applying it twice is the same as once (the page re-renders on every tick).
  const raw = "https://res.cloudinary.com/tarte/image/upload/v1/x.jpg"
  assert.equal(thankYouDisplayUrl(thankYouDisplayUrl(raw)), thankYouDisplayUrl(raw))
})
