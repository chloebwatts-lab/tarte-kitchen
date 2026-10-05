import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanText, dayString, isPrepList, noteVisible, taskOnDay } from "./section"

test("cleanText trims, collapses whitespace and caps length", () => {
  assert.equal(cleanText("  Laminate   croissant\n dough ", 120), "Laminate croissant dough")
  assert.equal(cleanText("   ", 120), "")
  assert.equal(cleanText("abcdef", 3), "abc")
  assert.equal(cleanText("ab   cd", 3), "ab")
})

test("isPrepList only accepts the two lists", () => {
  assert.equal(isPrepList("DAILY"), true)
  assert.equal(isPrepList("AFTERNOON"), true)
  assert.equal(isPrepList("daily"), false)
  assert.equal(isPrepList(null), false)
})

test("every-day tasks show every day, one-offs only on their day", () => {
  const day = "2026-10-05"
  assert.equal(taskOnDay({ isActive: true, onlyDay: null }, day), true)
  assert.equal(taskOnDay({ isActive: true, onlyDay: new Date("2026-10-05T00:00:00Z") }, day), true)
  assert.equal(taskOnDay({ isActive: true, onlyDay: new Date("2026-10-04T00:00:00Z") }, day), false)
  assert.equal(taskOnDay({ isActive: true, onlyDay: new Date("2026-10-06T00:00:00Z") }, day), false)
  assert.equal(taskOnDay({ isActive: false, onlyDay: null }, day), false)
})

test("dayString reads a DATE column without shifting the day", () => {
  assert.equal(dayString(new Date("2026-10-05T00:00:00.000Z")), "2026-10-05")
})

test("sorted notes drop off after three days, open notes never do", () => {
  const now = new Date("2026-10-05T02:00:00Z")
  assert.equal(noteVisible({ doneAt: null }, now), true)
  assert.equal(noteVisible({ doneAt: new Date("2026-10-03T03:00:00Z") }, now), true)
  assert.equal(noteVisible({ doneAt: new Date("2026-10-02T01:00:00Z") }, now), false)
})
