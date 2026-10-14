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

test("priority: only 1, 2 and 3 count; anything else is medium", () => {
  const { isPriority, toPriority, DEFAULT_PRIORITY } = require("./section") as typeof import("./section")
  assert.equal(isPriority(1), true)
  assert.equal(isPriority(3), true)
  assert.equal(isPriority(0), false)
  assert.equal(isPriority(4), false)
  assert.equal(isPriority("1"), false)
  assert.equal(toPriority("1"), 1)
  assert.equal(toPriority("3"), 3)
  assert.equal(toPriority(7), DEFAULT_PRIORITY)
  assert.equal(toPriority(null), 2)
  assert.equal(toPriority("urgent"), 2)
})

test("priority: tapping walks 1, 2, 3, 1", () => {
  const { nextPriority } = require("./section") as typeof import("./section")
  assert.equal(nextPriority(1), 2)
  assert.equal(nextPriority(2), 3)
  assert.equal(nextPriority(3), 1)
})

test("priority: urgent first, added order kept inside a priority", () => {
  const { byPriority } = require("./section") as typeof import("./section")
  const rows = [
    { id: "a", priority: 2 },
    { id: "b", priority: 3 },
    { id: "c", priority: 1 },
    { id: "d", priority: 2 },
    { id: "e", priority: 1 },
  ]
  assert.deepEqual(byPriority(rows).map((r) => r.id), ["c", "e", "a", "d", "b"])
  assert.deepEqual(byPriority([]), [])
  assert.deepEqual(rows.map((r) => r.id), ["a", "b", "c", "d", "e"], "input untouched")
})

test("list notes keep line breaks, lose trailing space, cap at the limit", () => {
  const { cleanNote, MAX_LIST_NOTE_LENGTH } = require("./section") as typeof import("./section")
  assert.equal(cleanNote("Croissants first  \r\nthen danish   "), "Croissants first\nthen danish")
  assert.equal(cleanNote("   "), "")
  assert.equal(cleanNote("x".repeat(MAX_LIST_NOTE_LENGTH + 50)).length, MAX_LIST_NOTE_LENGTH)
})
