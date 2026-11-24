import { test } from "node:test"
import assert from "node:assert/strict"
import { cadenceUsesDays, isQldPublicHoliday, lineOnDate, QLD_PUBLIC_HOLIDAYS, weekdayOf } from "./days"

const every = { days: [], alsoOnPublicHolidays: false }
const sunday = { days: [0], alsoOnPublicHolidays: false }
const surcharge = { days: [0], alsoOnPublicHolidays: true }
const alcohol = { days: [3, 5, 1], alsoOnPublicHolidays: false } // Wed, Fri, Mon
const weekend = { days: [6, 0], alsoOnPublicHolidays: false }

// Week of Wed 25 Nov 2026 to Tue 1 Dec 2026 (Tarte's week runs Wed to Tue).
const WED = "2026-11-25"
const THU = "2026-11-26"
const FRI = "2026-11-27"
const SAT = "2026-11-28"
const SUN = "2026-11-29"
const MON = "2026-11-30"
const TUE = "2026-12-01"

test("weekdayOf reads the AEST calendar date, 0 = Sunday", () => {
  assert.deepEqual([WED, THU, FRI, SAT, SUN, MON, TUE].map(weekdayOf), [3, 4, 5, 6, 0, 1, 2])
})

test("a line with no days is on every day's list", () => {
  for (const d of [WED, THU, FRI, SAT, SUN, MON, TUE]) assert.equal(lineOnDate(every, d), true)
})

test("Order alcohol: Wed, Fri and Mon only, as on Chloe's closing sheet", () => {
  const on = [WED, THU, FRI, SAT, SUN, MON, TUE].filter((d) => lineOnDate(alcohol, d))
  assert.deepEqual(on, [WED, FRI, MON])
})

test("Extra tables out on the beach: Saturday and Sunday only", () => {
  const on = [WED, THU, FRI, SAT, SUN, MON, TUE].filter((d) => lineOnDate(weekend, d))
  assert.deepEqual(on, [SAT, SUN])
})

test("surcharge lines: Sunday, plus any public holiday whatever the weekday", () => {
  assert.equal(lineOnDate(surcharge, SUN), true)
  assert.equal(lineOnDate(surcharge, MON), false)
  // Christmas Day 2026 is a Friday, Boxing Day (observed) a Monday.
  assert.equal(lineOnDate(surcharge, "2026-12-25"), true)
  assert.equal(lineOnDate(surcharge, "2026-12-28"), true)
  assert.equal(lineOnDate(surcharge, "2027-01-26"), true)
  // A Sunday-only line without the public holiday flag stays off on Christmas.
  assert.equal(lineOnDate(sunday, "2026-12-25"), false)
})

test("public holiday list: real dates, on the weekday they fall", () => {
  for (const d of QLD_PUBLIC_HOLIDAYS) assert.match(d, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(weekdayOf("2026-12-25"), 5) // Christmas 2026, Friday
  assert.equal(weekdayOf("2026-12-28"), 1) // Boxing Day observed, Monday
  assert.equal(weekdayOf("2027-03-26"), 5) // Good Friday 2027
  assert.equal(weekdayOf("2027-03-29"), 1) // Easter Monday 2027
  assert.equal(weekdayOf("2027-05-03"), 1) // Labour Day, first Monday in May
  assert.equal(weekdayOf("2027-10-04"), 1) // King's Birthday, first Monday in October
  assert.equal(weekdayOf("2027-12-27"), 1) // Christmas observed, Monday
  assert.equal(weekdayOf("2027-12-28"), 2) // Boxing Day observed, Tuesday
  assert.equal(isQldPublicHoliday("2026-11-24"), false)
})

test("only one-day lists filter by day", () => {
  assert.equal(cadenceUsesDays("DAILY"), true)
  assert.equal(cadenceUsesDays("ON_DEMAND"), true)
  assert.equal(cadenceUsesDays("WEEKLY"), false)
  assert.equal(cadenceUsesDays("MONTHLY"), false)
})
