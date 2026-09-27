import { test } from "node:test"
import assert from "node:assert/strict"
import {
  startOfTarteWeekUtc,
  weekStartWedIso,
  currentTarteWeekRange,
  lastCompletedTarteWeek,
  liveRosterWindowUnix,
  tarteWeekLabel,
} from "./dates"

// Tarte's trading week is Wed -> Tue in Brisbane time (UTC+10, no DST).
// Wed 00:00 AEST is Tue 14:00Z. The droplet runs in UTC, so every case
// below is written as a UTC instant and the expected value is the AEST
// Wednesday label (yyyy-mm-dd at UTC midnight).

const ymd = (d: Date) => d.toISOString().slice(0, 10)

// ------------------------------------------------------- startOfTarteWeekUtc

test("last second of Tue AEST (Tue 13:59:59Z) still belongs to the week that started the previous Wed", () => {
  // 2026-09-22 is a Tuesday. 13:59:59Z = 23:59:59 AEST.
  const d = startOfTarteWeekUtc(new Date("2026-09-22T13:59:59Z"))
  assert.equal(ymd(d), "2026-09-16")
  assert.equal(d.getUTCHours(), 0)
})

test("Wed 00:00 AEST (Tue 14:00Z) starts a new week", () => {
  const d = startOfTarteWeekUtc(new Date("2026-09-22T14:00:00Z"))
  assert.equal(ymd(d), "2026-09-23")
})

test("early Wed bakery shift at 04:00 AEST (Tue 18:00Z) lands in the new week, not Tuesday's", () => {
  assert.equal(weekStartWedIso(new Date("2026-09-22T18:00:00Z")), "2026-09-23")
})

test("Sunday afternoon AEST maps back to the Wednesday four days earlier", () => {
  // 2026-09-27 is a Sunday; 05:00Z = 15:00 AEST.
  assert.equal(weekStartWedIso(new Date("2026-09-27T05:00:00Z")), "2026-09-23")
})

test("Sun 23:59 AEST and Mon 00:00 AEST are the SAME Tarte week (Mon is not a boundary)", () => {
  assert.equal(weekStartWedIso(new Date("2026-09-27T13:59:00Z")), "2026-09-23")
  assert.equal(weekStartWedIso(new Date("2026-09-27T14:00:00Z")), "2026-09-23")
})

test("a Wednesday at UTC midnight labelled date is its own week start", () => {
  assert.equal(weekStartWedIso(new Date("2026-09-23T00:00:00Z")), "2026-09-23")
})

test("month end: Wed 30 Sep 23:59 AEST stays in the 30 Sep week, Wed 7 Oct 00:00 AEST starts 7 Oct", () => {
  assert.equal(weekStartWedIso(new Date("2026-09-30T13:59:00Z")), "2026-09-30")
  assert.equal(weekStartWedIso(new Date("2026-10-06T14:00:00Z")), "2026-10-07")
})

test("year end: New Year's Day 06:00 AEST (Fri) belongs to the week of Wed 30 Dec 2026", () => {
  assert.equal(weekStartWedIso(new Date("2026-12-31T20:00:00Z")), "2026-12-30")
})

test("leap day: Tue 29 Feb 2028 evening AEST is in the Wed 23 Feb week; Wed 1 Mar 00:00 AEST starts a new one", () => {
  assert.equal(weekStartWedIso(new Date("2028-02-29T10:00:00Z")), "2028-02-23")
  assert.equal(weekStartWedIso(new Date("2028-02-29T14:00:00Z")), "2028-03-01")
})

test("every day of one Tarte week resolves to the same Wednesday", () => {
  const wed = "2026-09-23"
  for (let h = 0; h < 7 * 24; h++) {
    const instant = new Date(Date.UTC(2026, 8, 22, 14) + h * 3_600_000)
    assert.equal(weekStartWedIso(instant), wed, `hour ${h} (${instant.toISOString()})`)
  }
  // One millisecond before the window opens is the previous week.
  assert.equal(weekStartWedIso(new Date(Date.UTC(2026, 8, 22, 14) - 1)), "2026-09-16")
  // Exactly seven days later is the next.
  assert.equal(weekStartWedIso(new Date(Date.UTC(2026, 8, 29, 14))), "2026-09-30")
})

test("startOfTarteWeekUtc does not mutate its input", () => {
  const input = new Date("2026-09-27T05:00:00Z")
  const copy = input.getTime()
  startOfTarteWeekUtc(input)
  assert.equal(input.getTime(), copy)
})

// ---------------------------------------------------- currentTarteWeekRange

test("currentTarteWeekRange is this Wed to next Wed (exclusive end), 7 days apart", () => {
  const { start, end } = currentTarteWeekRange(new Date("2026-09-27T05:00:00Z"))
  assert.equal(ymd(start), "2026-09-23")
  assert.equal(ymd(end), "2026-09-30")
  assert.equal(end.getTime() - start.getTime(), 7 * 86_400_000)
})

// ---------------------------------------------------- lastCompletedTarteWeek

test("Friday 08:00 AEST digest run reports the Wed -> Tue week that closed on Tuesday", () => {
  // Fri 25 Sep 2026 08:00 AEST = Thu 24 Sep 22:00Z
  const w = lastCompletedTarteWeek(new Date("2026-09-24T22:00:00Z"))
  assert.equal(w.startKey, "2026-09-16")
  assert.equal(w.endKey, "2026-09-22")
  assert.equal(w.start.toISOString(), "2026-09-16T00:00:00.000Z")
  assert.equal(w.end.toISOString(), "2026-09-22T23:59:59.999Z")
})

test("lastCompletedTarteWeek on Tue 23:59 AEST still reports the week before (current week not closed yet)", () => {
  const w = lastCompletedTarteWeek(new Date("2026-09-22T13:59:00Z"))
  assert.equal(w.startKey, "2026-09-09")
  assert.equal(w.endKey, "2026-09-15")
})

test("lastCompletedTarteWeek rolls the moment Wed 00:00 AEST arrives", () => {
  const w = lastCompletedTarteWeek(new Date("2026-09-22T14:00:00Z"))
  assert.equal(w.startKey, "2026-09-16")
  assert.equal(w.endKey, "2026-09-22")
})

test("lastCompletedTarteWeek across a year boundary", () => {
  // Fri 8 Jan 2027 08:00 AEST = Thu 7 Jan 22:00Z. This week's Wed = 6 Jan; last = 30 Dec -> 5 Jan.
  const w = lastCompletedTarteWeek(new Date("2027-01-07T22:00:00Z"))
  assert.equal(w.startKey, "2026-12-30")
  assert.equal(w.endKey, "2027-01-05")
})

test("lastCompletedTarteWeek keys always span exactly 6 calendar days", () => {
  for (let i = 0; i < 60; i++) {
    const now = new Date(Date.UTC(2026, 0, 1, 3) + i * 86_400_000 * 1.37)
    const w = lastCompletedTarteWeek(now)
    const days = (Date.parse(w.endKey) - Date.parse(w.startKey)) / 86_400_000
    assert.equal(days, 6, now.toISOString())
    assert.equal(new Date(w.startKey).getUTCDay(), 3, `${w.startKey} should be a Wednesday`)
  }
})

// ----------------------------------------------------- liveRosterWindowUnix

test("liveRosterWindowUnix returns the real UTC instant of Wed 00:00 AEST and 14 days after", () => {
  const { sinceUnix, untilUnix } = liveRosterWindowUnix(new Date("2026-09-27T05:00:00Z"))
  assert.equal(sinceUnix, Date.UTC(2026, 8, 22, 14) / 1000)
  assert.equal(untilUnix - sinceUnix, 14 * 86_400)
})

test("liveRosterWindowUnix includes a 4am Wed bakery shift (Tue 18:00Z) in the window", () => {
  const { sinceUnix } = liveRosterWindowUnix(new Date("2026-09-27T05:00:00Z"))
  const bakeryShift = Date.UTC(2026, 8, 22, 18) / 1000
  assert.ok(bakeryShift >= sinceUnix)
})

// ----------------------------------------------------------- tarteWeekLabel

test("tarteWeekLabel prints Wed .. Tue for a Wed UTC-midnight date", () => {
  // Uses host-local toLocaleDateString; correct on any TZ at or east of UTC
  // (droplet UTC, Chloe's Mac AEST). See report for the west-of-UTC caveat.
  const label = tarteWeekLabel(new Date("2026-10-07T00:00:00Z"))
  assert.match(label, /^Wed,? 7 Oct/)
  assert.match(label, /Tue,? 13 Oct$/)
})
