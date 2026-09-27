import { test } from "node:test"
import assert from "node:assert/strict"
import { stripContextPrefix } from "./display"

test("strips the section prefix with any dash or colon separator", () => {
  assert.equal(stripContextPrefix("Cafe Kitchen — Daily Clean", "Cafe Kitchen"), "Daily Clean")
  assert.equal(stripContextPrefix("Cafe Kitchen - Daily Clean", "Cafe Kitchen"), "Daily Clean")
  assert.equal(stripContextPrefix("Cafe Kitchen – Daily Clean", "Cafe Kitchen"), "Daily Clean")
  assert.equal(stripContextPrefix("Cafe Kitchen: Daily Clean", "Cafe Kitchen"), "Daily Clean")
  assert.equal(stripContextPrefix("Cafe Kitchen · Daily Clean", "Cafe Kitchen"), "Daily Clean")
})

test("prefix match is case-insensitive and anchored at the start", () => {
  assert.equal(stripContextPrefix("cafe kitchen - Daily Clean", "Cafe Kitchen"), "Daily Clean")
  assert.equal(stripContextPrefix("Daily Clean - Cafe Kitchen", "Cafe Kitchen"), "Daily Clean - Cafe Kitchen")
})

test("context containing regex metacharacters is escaped", () => {
  assert.equal(stripContextPrefix("Bar (Upstairs) - Close", "Bar (Upstairs)"), "Close")
  assert.equal(stripContextPrefix("Prep+Pastry - Weekly", "Prep+Pastry"), "Weekly")
})

test("em dashes anywhere become ' - ' (house style), even without a context", () => {
  assert.equal(stripContextPrefix("Fridge — back bar — temps"), "Fridge - back bar - temps")
  assert.equal(stripContextPrefix("Fridge—temps"), "Fridge - temps")
})

test("null / undefined context and a name without a prefix are left alone", () => {
  assert.equal(stripContextPrefix("Daily Clean", null), "Daily Clean")
  assert.equal(stripContextPrefix("Daily Clean", undefined), "Daily Clean")
  assert.equal(stripContextPrefix("Daily Clean", "Pastry"), "Daily Clean")
  assert.equal(stripContextPrefix("", "Pastry"), "")
})
