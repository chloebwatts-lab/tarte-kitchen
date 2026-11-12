import { test } from "node:test"
import assert from "node:assert/strict"
import { isFohDailyClean, isOurCloudinaryUrl, pickOne } from "./thank-you"

const t = (area: string | null, name: string, cadence = "DAILY", isFoodSafety = false) => ({ area, name, cadence, isFoodSafety })

test("FOH daily cleans get the thank-you page", () => {
  assert.equal(isFohDailyClean(t("Market", "Market — Daily Clean")), true)
  assert.equal(isFohDailyClean(t("FOH", "FOH — Daily Tasks")), true)
  assert.equal(isFohDailyClean(t("Barista", "Barista — Daily Clean")), true)
  assert.equal(isFohDailyClean(t("Takeaway", "Takeaway — Daily Clean")), true)
  assert.equal(isFohDailyClean(t("FOH Cafe", "Cafe — Closing")), true)
  assert.equal(isFohDailyClean(t("FOH Restaurant", "Restaurant — Opening")), true)
  assert.equal(isFohDailyClean(t("Bar", "Bar — Closing Clean")), true)
  assert.equal(isFohDailyClean(t("KP", "FOH KP — Daily Close")), true)
})

test("kitchen, weekly, monthly and food safety lists do not", () => {
  assert.equal(isFohDailyClean(t("KP", "KP — Daily Close")), false)
  assert.equal(isFohDailyClean(t("Kitchen", "Chefs — Daily Clean")), false)
  assert.equal(isFohDailyClean(t("Pastry", "Pastry — Daily Clean")), false)
  assert.equal(isFohDailyClean(t("FOH", "FOH — Weekly Clean", "WEEKLY")), false)
  assert.equal(isFohDailyClean(t("FOH", "FOH — Monthly Tasks", "MONTHLY")), false)
  assert.equal(isFohDailyClean(t("Market", "Market — Temperature Check AM", "DAILY", true)), false)
  assert.equal(isFohDailyClean(t(null, "Pest Activity Log")), false)
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

test("real seeded lists: BH kitchens and on-demand lists stay out, Tea Garden and Currumbin FOH get it", () => {
  // Beach House kitchen areas contain "Cafe" / "Restaurant" but are not FOH.
  assert.equal(isFohDailyClean(t("Restaurant Kitchen", "Restaurant Kitchen — Daily Clean")), false)
  assert.equal(isFohDailyClean(t("Cafe Kitchen", "Cafe Kitchen — Daily Clean")), false)
  assert.equal(isFohDailyClean(t("Food Safety", "Delivery Temperature Check", "ON_DEMAND", true)), false)
  assert.equal(isFohDailyClean(t("FOH", "FOH — Daily Tasks", "ON_DEMAND")), false)
  assert.equal(isFohDailyClean(t("KP", "KP — Daily Close")), false)
  // Tea Garden opening/closing sit under FOH with plain names.
  assert.equal(isFohDailyClean(t("FOH", "Opening")), true)
  assert.equal(isFohDailyClean(t("FOH", "Closing")), true)
  assert.equal(isFohDailyClean(t("Market", "Currumbin Market — Daily Clean")), true)
})

test("area casing and stray spaces do not matter, and a name merely starting with 'Fo' is not FOH", () => {
  assert.equal(isFohDailyClean(t("  market ", "Market — Daily Clean")), true)
  assert.equal(isFohDailyClean(t("BARISTA", "Barista — Daily Clean")), true)
  assert.equal(isFohDailyClean(t("KP", "  foh kp — daily close")), true)
  assert.equal(isFohDailyClean(t("", "Food Prep — Daily Clean")), false)
  assert.equal(isFohDailyClean(t("   ", "Kitchen — Daily Clean")), false)
  assert.equal(isFohDailyClean(t("Kitchen", "Fohx list")), false)
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
