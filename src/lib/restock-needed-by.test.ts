import { test } from "node:test"
import assert from "node:assert/strict"
import {
  NEEDED_BY_TIMES,
  brisbaneYmd,
  neededByAt,
  neededByDays,
  splitNeededBy,
  formatNeededBy,
  isLate,
} from "./restock-needed-by"

// Brisbane is UTC+10 with no DST: the local day flips at 14:00Z.

test("brisbaneYmd flips to the next calendar day at 14:00Z", () => {
  assert.equal(brisbaneYmd(new Date("2026-09-22T13:59:59Z")), "2026-09-22")
  assert.equal(brisbaneYmd(new Date("2026-09-22T14:00:00Z")), "2026-09-23")
})

test("brisbaneYmd across month, year and leap-day boundaries", () => {
  assert.equal(brisbaneYmd(new Date("2026-09-30T14:00:00Z")), "2026-10-01")
  assert.equal(brisbaneYmd(new Date("2026-12-31T14:00:00Z")), "2027-01-01")
  assert.equal(brisbaneYmd(new Date("2028-02-28T14:00:00Z")), "2028-02-29")
  assert.equal(brisbaneYmd(new Date("2028-02-29T14:00:00Z")), "2028-03-01")
})

test("neededByAt builds the UTC instant for a Brisbane clock time", () => {
  // Open (6am) on Thu 24 Sep AEST = Wed 23 Sep 20:00Z
  assert.equal(neededByAt("2026-09-24", 6).toISOString(), "2026-09-23T20:00:00.000Z")
  // 2pm same day = 04:00Z
  assert.equal(neededByAt("2026-09-24", 14).toISOString(), "2026-09-24T04:00:00.000Z")
})

test("splitNeededBy is the inverse of neededByAt for every offered time", () => {
  for (const t of NEEDED_BY_TIMES) {
    const iso = neededByAt("2026-09-24", t.hour).toISOString()
    assert.deepEqual(splitNeededBy(iso), { ymd: "2026-09-24", hour: t.hour })
  }
})

test("splitNeededBy on a stored instant that crosses the UTC date line", () => {
  // 05:00 AEST Wed 23 Sep is stored as Tue 22 Sep 19:00Z.
  assert.deepEqual(splitNeededBy("2026-09-22T19:00:00.000Z"), { ymd: "2026-09-23", hour: 5 })
})

test("neededByDays offers tomorrow plus the next two days, in Brisbane time", () => {
  // Sunday 27 Sep 15:00 AEST
  const days = neededByDays(new Date("2026-09-27T05:00:00Z"))
  assert.deepEqual(days, [
    { ymd: "2026-09-28", label: "Tomorrow" },
    { ymd: "2026-09-29", label: "Tue" },
    { ymd: "2026-09-30", label: "Wed" },
  ])
})

test("neededByDays at Sun 23:59 AEST vs Mon 00:00 AEST rolls 'Tomorrow' forward one day", () => {
  const lateSun = neededByDays(new Date("2026-09-27T13:59:00Z"))
  assert.equal(lateSun[0].ymd, "2026-09-28")
  const earlyMon = neededByDays(new Date("2026-09-27T14:00:00Z"))
  assert.equal(earlyMon[0].ymd, "2026-09-29")
  assert.equal(earlyMon[0].label, "Tomorrow")
  assert.equal(earlyMon[1].label, "Wed")
  assert.equal(earlyMon[2].label, "Thu")
})

test("neededByDays across month end", () => {
  const days = neededByDays(new Date("2026-09-30T02:00:00Z")) // Wed 30 Sep midday AEST
  assert.deepEqual(days.map((d) => d.ymd), ["2026-10-01", "2026-10-02", "2026-10-03"])
})

test("formatNeededBy says today / tomorrow / weekday relative to Brisbane now", () => {
  const iso = neededByAt("2026-09-28", 10).toISOString() // Mon 28 Sep 10am
  assert.equal(formatNeededBy(iso, new Date("2026-09-28T00:00:00Z")), "By 10am today") // Mon 10:00 AEST
  assert.equal(formatNeededBy(iso, new Date("2026-09-27T05:00:00Z")), "By 10am tomorrow") // Sun
  assert.equal(formatNeededBy(iso, new Date("2026-09-26T05:00:00Z")), "By 10am Mon") // Sat
})

test("formatNeededBy at the Sun/Mon AEST boundary", () => {
  const iso = neededByAt("2026-09-28", 6).toISOString()
  // Sun 23:59 AEST: Monday is tomorrow
  assert.equal(formatNeededBy(iso, new Date("2026-09-27T13:59:00Z")), "By open tomorrow")
  // Mon 00:00 AEST: Monday is today
  assert.equal(formatNeededBy(iso, new Date("2026-09-27T14:00:00Z")), "By open today")
})

test("formatNeededBy falls back to a clock label for hours not on the picker", () => {
  const now = new Date("2026-09-20T05:00:00Z")
  assert.equal(formatNeededBy(neededByAt("2026-09-24", 7).toISOString(), now), "By 7am Thu")
  assert.equal(formatNeededBy(neededByAt("2026-09-24", 13).toISOString(), now), "By 1pm Thu")
  assert.equal(formatNeededBy(neededByAt("2026-09-24", 0).toISOString(), now), "By 12am Thu")
  assert.equal(formatNeededBy(neededByAt("2026-09-24", 12).toISOString(), now), "By 12pm Thu")
  assert.equal(formatNeededBy(neededByAt("2026-09-24", 23).toISOString(), now), "By 11pm Thu")
})

test("isLate is strictly past the instant", () => {
  const iso = "2026-09-24T04:00:00.000Z"
  assert.equal(isLate(iso, new Date("2026-09-24T03:59:59.999Z")), false)
  assert.equal(isLate(iso, new Date("2026-09-24T04:00:00.000Z")), false)
  assert.equal(isLate(iso, new Date("2026-09-24T04:00:00.001Z")), true)
})
