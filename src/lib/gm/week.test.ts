import { test } from "node:test"
import assert from "node:assert/strict"
import { gmWeekPos, gmWeekStart, gmWeekStartOf } from "./week"
import { weekStartWedIso } from "@/lib/dates"

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const ymd = (d: Date) => d.toISOString().slice(0, 10)

test("every day of a trading week resolves to its Wednesday", () => {
  // Wed 23 Sep 2026 to Tue 29 Sep 2026.
  for (const day of ["2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29"]) {
    assert.equal(ymd(gmWeekStartOf(utc(day))), "2026-09-23", day)
  }
  assert.equal(ymd(gmWeekStartOf(utc("2026-09-30"))), "2026-09-30", "next Wednesday starts a new week")
  assert.equal(ymd(gmWeekStartOf(utc("2026-09-22"))), "2026-09-16", "Tuesday before belongs to the prior week")
})

test("week start crosses month and year boundaries", () => {
  assert.equal(ymd(gmWeekStartOf(utc("2026-10-01"))), "2026-09-30")
  assert.equal(ymd(gmWeekStartOf(utc("2027-01-01"))), "2026-12-30")
  assert.equal(ymd(gmWeekStartOf(utc("2026-03-02"))), "2026-02-25", "Monday after a leap-free Feb")
})

test("result is always a UTC-midnight Wednesday and never after the input", () => {
  for (let i = 0; i < 60; i++) {
    const d = utc("2026-09-01")
    d.setUTCDate(d.getUTCDate() + i)
    const w = gmWeekStartOf(d)
    assert.equal(w.getUTCDay(), 3, ymd(d))
    assert.equal(w.getUTCHours(), 0)
    assert.ok(w.getTime() <= d.getTime())
    assert.ok(d.getTime() - w.getTime() < 7 * 86400000)
  }
})

test("does not mutate its input", () => {
  const d = utc("2026-09-27")
  gmWeekStartOf(d)
  assert.equal(ymd(d), "2026-09-27")
})

test("gmWeekPos: Wed is day 0 of the GM week, Tue is day 6", () => {
  assert.equal(gmWeekPos(3), 0) // Wed
  assert.equal(gmWeekPos(4), 1) // Thu, people
  assert.equal(gmWeekPos(5), 2) // Fri, kitchen and money
  assert.equal(gmWeekPos(6), 3) // Sat
  assert.equal(gmWeekPos(7), 4) // Sun
  assert.equal(gmWeekPos(1), 5) // Mon, rosters + report
  assert.equal(gmWeekPos(2), 6) // Tue, off
})

test("gmWeekPos is a bijection over ISO weekdays 1..7", () => {
  const seen = new Set<number>()
  for (let iso = 1; iso <= 7; iso++) seen.add(gmWeekPos(iso))
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3, 4, 5, 6])
})

test("gmWeekStart agrees with the Tarte-week helper in dates.ts for right now", () => {
  const s = gmWeekStart()
  assert.match(s, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(utc(s).getUTCDay(), 3, "is a Wednesday")
  assert.equal(s, weekStartWedIso(new Date()))
})
