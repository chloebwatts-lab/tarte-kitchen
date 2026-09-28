import { test } from "node:test"
import assert from "node:assert/strict"
import {
  startOfTarteWeekUtc,
  weekStartWedIso,
  currentTarteWeekRange,
  lastCompletedTarteWeek,
  liveRosterWindowUnix,
  tarteWeekLabel,
  aestDay,
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

// ------------------------------------------------------------------ aestDay
// The line-up "Today" section filters LabourShift.shiftStart (a real
// instant) by AEST calendar day. Georgia's report on Mon 28 Sep 2026: right
// date on screen, wrong staff. The window was built from the date-only key
// (UTC midnight = 10am AEST), so it ran 10am Mon → 10am Tue and every early
// shift shown was Tuesday's.

test("aestDay at 7:02am AEST Mon 28 Sep keys to 2026-09-28", () => {
  // 7:02am AEST = 21:02Z the previous evening.
  const d = aestDay(new Date("2026-09-27T21:02:00Z"))
  assert.equal(ymd(d.key), "2026-09-28")
  assert.equal(d.key.getUTCHours(), 0)
})

test("aestDay start/end are the true UTC instants of 00:00 and 24:00 AEST", () => {
  const d = aestDay(new Date("2026-09-27T21:02:00Z"))
  assert.equal(d.start.toISOString(), "2026-09-27T14:00:00.000Z")
  assert.equal(d.end.toISOString(), "2026-09-28T14:00:00.000Z")
})

test("a 5:30am AEST shift today falls inside today's window, not outside it", () => {
  const d = aestDay(new Date("2026-09-27T21:02:00Z"))
  const shift = new Date("2026-09-27T19:30:00Z") // 5:30am AEST Mon 28 Sep
  assert.ok(shift >= d.start && shift < d.end)
  // The old bound (the date-only key) would have excluded it.
  assert.ok(shift < d.key)
})

test("tomorrow's 6am shift is excluded from today's window", () => {
  const d = aestDay(new Date("2026-09-27T21:02:00Z"))
  const tomorrow = new Date("2026-09-28T20:00:00Z") // 6am AEST Tue 29 Sep
  assert.ok(tomorrow >= d.end)
  // The old bound (key + 1 day = 10am AEST Tue) would have included it.
  assert.ok(tomorrow < new Date(d.key.getTime() + 86_400_000))
})

test("aestDay just before and after AEST midnight lands on different days", () => {
  const lateSun = aestDay(new Date("2026-09-27T13:59:59Z")) // 23:59:59 AEST Sun
  const earlyMon = aestDay(new Date("2026-09-27T14:00:00Z")) // 00:00 AEST Mon
  assert.equal(ymd(lateSun.key), "2026-09-27")
  assert.equal(ymd(earlyMon.key), "2026-09-28")
  assert.equal(lateSun.end.getTime(), earlyMon.start.getTime())
})

test("aestDay defaults to now and spans exactly 24 hours", () => {
  const d = aestDay()
  assert.equal(d.end.getTime() - d.start.getTime(), 24 * 60 * 60 * 1000)
  assert.ok(d.start <= new Date() && new Date() < d.end)
})

// Independent oracle: Intl knows Australia/Brisbane. The helper must agree
// with it for every hour of a week, and the window must contain its input.
const brisbaneYmd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Brisbane",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)

test("aestDay key matches Intl's Australia/Brisbane date for every hour of a week, and start <= at < end", () => {
  for (let h = 0; h < 7 * 24; h++) {
    // Off the hour on purpose so the test is not only exercising boundaries.
    const at = new Date(Date.UTC(2026, 8, 21, 0, 17, 43) + h * 3_600_000)
    const d = aestDay(at)
    assert.equal(ymd(d.key), brisbaneYmd(at), at.toISOString())
    assert.ok(d.start <= at && at < d.end, `${at.toISOString()} outside its own day`)
    assert.equal(d.end.getTime() - d.start.getTime(), 86_400_000)
  }
})

test("aestDay key (DATE column) and start (timestamp window) describe the same day: start is key minus 10h", () => {
  const d = aestDay(new Date("2026-09-27T21:02:00Z"))
  assert.equal(d.key.getTime() - d.start.getTime(), 10 * 3_600_000)
  // So the LineUp.date row and the shiftStart window can never disagree.
  assert.equal(ymd(d.key), brisbaneYmd(d.start))
  assert.equal(ymd(d.key), brisbaneYmd(new Date(d.end.getTime() - 1)))
})

test("aestDay at exactly UTC midnight (10am AEST) keys to that same date, not the day before", () => {
  const d = aestDay(new Date("2026-09-28T00:00:00Z"))
  assert.equal(ymd(d.key), "2026-09-28")
  assert.equal(d.start.toISOString(), "2026-09-27T14:00:00.000Z")
  // The old bound was the key itself: 10 hours into the day, so a 5am
  // shift was already behind it.
  assert.ok(d.start < d.key)
})

test("aestDay year end: 00:30 AEST New Year's Day 2027 is 2027-01-01 with a window starting 31 Dec 14:00Z", () => {
  const d = aestDay(new Date("2026-12-31T14:30:00Z"))
  assert.equal(ymd(d.key), "2027-01-01")
  assert.equal(d.start.toISOString(), "2026-12-31T14:00:00.000Z")
  assert.equal(d.end.toISOString(), "2027-01-01T14:00:00.000Z")
  // And 23:30 AEST on New Year's Eve is still 2026.
  assert.equal(ymd(aestDay(new Date("2026-12-31T13:30:00Z")).key), "2026-12-31")
})

test("aestDay leap day: 3am AEST 29 Feb 2028 (28 Feb 17:00Z) keys to 2028-02-29 and ends at 1 Mar 00:00 AEST", () => {
  const d = aestDay(new Date("2028-02-28T17:00:00Z"))
  assert.equal(ymd(d.key), "2028-02-29")
  assert.equal(d.end.toISOString(), "2028-02-29T14:00:00.000Z")
  assert.equal(ymd(aestDay(d.end).key), "2028-03-01")
})

test("aestDay days chain: each day's end is exactly the next day's start across a month boundary", () => {
  let cursor = aestDay(new Date("2026-09-28T02:00:00Z"))
  for (let i = 0; i < 10; i++) {
    const next = aestDay(cursor.end)
    assert.equal(next.start.getTime(), cursor.end.getTime())
    assert.equal(next.key.getTime() - cursor.key.getTime(), 86_400_000)
    cursor = next
  }
  assert.equal(ymd(cursor.key), "2026-10-08")
})

test("aestDay does not mutate its input", () => {
  const input = new Date("2026-09-27T21:02:00Z")
  const before = input.getTime()
  aestDay(input)
  assert.equal(input.getTime(), before)
})
