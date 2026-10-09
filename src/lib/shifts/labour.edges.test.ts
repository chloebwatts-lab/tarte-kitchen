import { test } from "node:test"
import assert from "node:assert/strict"
import {
  aestDateIso,
  labourRowsFromFeed,
  SALARY_PLACEHOLDER_AREA,
  SHIFTS_ID_PREFIX,
  tarteWeekStartInstant,
  type FeedSalary,
  type FeedShift,
  type FeedTimesheet,
  type ShiftsLabourFeed,
} from "./labour"
import { startOfTarteWeekUtc, weekStartWedIso } from "@/lib/dates"
import { bucketFor } from "@/lib/labour/buckets"

// Edge cases the main labour.test.ts does not reach: AEST vs UTC week
// boundaries, zero / negative / string inputs, salary double counting and
// id collisions. Queensland has no daylight saving, so AEST is a fixed +10.

const AEST_MS = 10 * 3600_000
// Wed 7 Oct 2026 00:00 AEST = Tue 6 Oct 14:00 UTC
const WED = new Date("2026-10-06T14:00:00.000Z")
const PREV_WED = new Date("2026-09-29T14:00:00.000Z")
const NEXT_WED = new Date("2026-10-13T14:00:00.000Z")

const empty = (over: Partial<ShiftsLabourFeed> = {}): ShiftsLabourFeed => ({
  ok: true,
  from: "2026-09-30",
  to: "2026-11-04",
  shifts: [],
  timesheets: [],
  ...over,
})

const shift = (over: Partial<FeedShift> = {}): FeedShift => ({
  id: "s1",
  venue: "BURLEIGH",
  area: "Kitchen",
  employeeId: "e1",
  employeeName: "Yamil Awad",
  start: "2026-10-06T20:00:00.000Z", // Wed 6am AEST
  end: "2026-10-07T04:30:00.000Z", // Wed 2:30pm AEST
  breakMin: 30,
  hours: 8,
  cost: 264,
  isOpen: false,
  published: true,
  ...over,
})

const sheet = (over: Partial<FeedTimesheet> = {}): FeedTimesheet => ({
  id: "t1",
  venue: "BURLEIGH",
  area: "FOH",
  employeeId: "e2",
  employeeName: "Lacey Corby",
  clockIn: "2026-10-06T20:02:00.000Z",
  clockOut: "2026-10-07T04:00:00.000Z",
  breakMin: 30,
  hours: 7.47,
  cost: 240.3,
  approved: true,
  ...over,
})

// ------------------------------------------------ week start, AEST vs UTC

test("tarteWeekStartInstant agrees with dates.ts startOfTarteWeekUtc (minus 10h) at every 6h step over 70 days", () => {
  const from = Date.parse("2026-09-01T00:00:00.000Z")
  for (let t = from; t < from + 70 * 86400_000; t += 6 * 3600_000) {
    const d = new Date(t)
    const want = startOfTarteWeekUtc(d).getTime() - AEST_MS
    assert.equal(tarteWeekStartInstant(d).getTime(), want, d.toISOString())
  }
})

test("the Tuesday/Wednesday midnight AEST boundary: one millisecond decides the week", () => {
  // Tue 6 Oct 23:59:59.999 AEST is still the week of Wed 30 Sep
  assert.equal(tarteWeekStartInstant(new Date("2026-10-06T13:59:59.999Z")).toISOString(), PREV_WED.toISOString())
  // Wed 7 Oct 00:00:00.000 AEST opens the new week
  assert.equal(tarteWeekStartInstant(new Date("2026-10-06T14:00:00.000Z")).toISOString(), WED.toISOString())
  // Wed 2am AEST is still Tuesday in UTC; it belongs to the new week, not the old
  assert.equal(tarteWeekStartInstant(new Date("2026-10-06T16:00:00.000Z")).toISOString(), WED.toISOString())
})

test("Sunday (JS weekday 0) and the new year both resolve to the right Wednesday", () => {
  // Sun 11 Oct 2026 2pm AEST
  assert.equal(tarteWeekStartInstant(new Date("2026-10-11T04:00:00.000Z")).toISOString(), WED.toISOString())
  // Fri 1 Jan 2027 10am AEST -> Wed 30 Dec 2026 00:00 AEST
  assert.equal(tarteWeekStartInstant(new Date("2027-01-01T00:00:00.000Z")).toISOString(), "2026-12-29T14:00:00.000Z")
  // Wed 30 Dec 2026 00:00 AEST exactly is its own week start
  assert.equal(tarteWeekStartInstant(new Date("2026-12-29T14:00:00.000Z")).toISOString(), "2026-12-29T14:00:00.000Z")
})

test("aestDateIso rolls the calendar day at 14:00 UTC, including across the year end", () => {
  assert.equal(aestDateIso(new Date("2026-10-06T13:59:59.999Z")), "2026-10-06")
  assert.equal(aestDateIso(new Date("2026-10-06T14:00:00.000Z")), "2026-10-07")
  assert.equal(aestDateIso(new Date("2026-12-31T14:00:00.000Z")), "2027-01-01")
  assert.equal(aestDateIso(new Date("2026-12-31T13:59:00.000Z")), "2026-12-31")
})

// ------------------------------------------------------------ salary rows

test("salary roll-up rows land in the trading week the dashboard groups by (startOfTarteWeekUtc on shiftStart)", () => {
  const salaries: FeedSalary[] = [{ venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 4196.34, headcount: 3 }]
  const { roster } = labourRowsFromFeed(empty({ salaries }), [WED, NEXT_WED])
  assert.equal(roster.length, 2)
  // Exactly Wed 00:00 AEST, so src/lib/actions/labour.ts keys it to that Wednesday, never Tuesday's week.
  assert.equal(weekStartWedIso(startOfTarteWeekUtc(roster[0].shiftStart)), "2026-10-07")
  assert.equal(weekStartWedIso(startOfTarteWeekUtc(roster[1].shiftStart)), "2026-10-14")
  // And it is the first instant of the week, so a window with gte: weekStart includes it.
  assert.equal(roster[0].shiftStart.getTime(), WED.getTime())
  assert.ok(roster[0].shiftEnd.getTime() > roster[0].shiftStart.getTime())
  assert.ok(roster[0].shiftEnd.getTime() < NEXT_WED.getTime())
})

test("salary rows are one weekly gross per week, never summed across weeks or doubled by headcount", () => {
  const salaries: FeedSalary[] = [{ venue: "BEACH_HOUSE", bucket: "FOH_BARISTA", weeklyGross: 3200, headcount: 3 }]
  const weeks = [WED, NEXT_WED, new Date(NEXT_WED.getTime() + 7 * 86400_000), new Date(NEXT_WED.getTime() + 14 * 86400_000)]
  const { roster } = labourRowsFromFeed(empty({ salaries }), weeks)
  assert.equal(roster.length, 4)
  for (const r of roster) {
    assert.equal(r.cost, 3200)
    assert.equal(r.hours, 0) // GM horizon excludes them via hours > 0
    assert.equal(r.employeeId, null)
    assert.equal(r.isOpen, false)
    assert.match(r.area ?? "", /^salary/i) // live tracker fixed-cost rule
  }
  assert.equal(roster.reduce((s, r) => s + r.cost, 0), 3200 * 4)
})

test("salary rows: negative, NaN, string, zero gross and unknown buckets are dropped, never subtracted", () => {
  const salaries = [
    { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: -500, headcount: 1 },
    { venue: "BURLEIGH", bucket: "FOH_BARISTA", weeklyGross: Number.NaN, headcount: 1 },
    { venue: "BURLEIGH", bucket: "PASTRY", weeklyGross: "abc", headcount: 1 },
    { venue: "BURLEIGH", bucket: "OTHER", weeklyGross: 0, headcount: 1 },
    { venue: "BURLEIGH", bucket: "ADMIN", weeklyGross: 1000, headcount: 1 },
    { venue: "MARS", bucket: "CHEFS_KP", weeklyGross: 1000, headcount: 1 },
    // numeric string is accepted (JSON from the feed may stringify)
    { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: "1234.56", headcount: "2" },
  ] as unknown as FeedSalary[]
  const { roster } = labourRowsFromFeed(empty({ salaries }), [WED])
  assert.equal(roster.length, 1)
  assert.equal(roster[0].area, "Salary BOH BURLEIGH")
  assert.equal(roster[0].cost, 1234.56)
})

test("no roster weeks or no salaries means no salary rows (feed may ship without salaries at first)", () => {
  const salaries: FeedSalary[] = [{ venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 1000, headcount: 1 }]
  assert.equal(labourRowsFromFeed(empty({ salaries }), []).roster.length, 0)
  assert.equal(labourRowsFromFeed(empty({ salaries: undefined }), [WED]).roster.length, 0)
  assert.equal(labourRowsFromFeed(empty({ salaries: [] }), [WED, NEXT_WED]).roster.length, 0)
})

test("salary roll-up cents survive summing (floating point) and are rounded to 2dp", () => {
  const salaries: FeedSalary[] = [
    { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 0.1, headcount: 1 },
    { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 0.2, headcount: 1 },
    { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 1923.075, headcount: 1 },
  ]
  const { roster } = labourRowsFromFeed(empty({ salaries }), [WED])
  assert.equal(roster[0].cost, 1923.38) // 1923.375 -> 1923.38
})

test("every placeholder area name buckets like its Deputy-era card and is a Salary name for the line-up filter", () => {
  const want = { CHEFS_KP: "chefsKp", FOH_BARISTA: "fohBarista", PASTRY: "pastry", OTHER: "other" } as const
  for (const venue of ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as const) {
    for (const bucket of ["CHEFS_KP", "FOH_BARISTA", "PASTRY", "OTHER"] as const) {
      const area = SALARY_PLACEHOLDER_AREA[venue][bucket]
      assert.equal(bucketFor(venue, area), want[bucket], `${venue} ${bucket}`)
      assert.match(area, /^Salary\b/)
    }
  }
  // Names are unique across venue + bucket, so the ids and areas cannot collide.
  const all = Object.values(SALARY_PLACEHOLDER_AREA).flatMap((m) => Object.values(m))
  assert.equal(new Set(all).size, all.length)
})

// --------------------------------------------------------- id uniqueness

test("deputyIds never collide: a shift, a timesheet and a salary row may share the raw id, and mapping is deterministic", () => {
  const feed = empty({
    shifts: [shift({ id: "abc" }), shift({ id: "abc2", start: "2026-10-07T20:00:00.000Z", end: "2026-10-08T04:00:00.000Z" })],
    timesheets: [sheet({ id: "abc" })],
    salaries: [
      { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 1000, headcount: 1 },
      { venue: "BURLEIGH", bucket: "FOH_BARISTA", weeklyGross: 1000, headcount: 1 },
    ],
  })
  const a = labourRowsFromFeed(feed, [WED, NEXT_WED])
  const b = labourRowsFromFeed(feed, [WED, NEXT_WED])
  const ids = [...a.roster, ...a.timesheets].map((r) => r.deputyId)
  assert.equal(new Set(ids).size, ids.length, "all ids unique in one mapping")
  assert.deepEqual(ids, [...b.roster, ...b.timesheets].map((r) => r.deputyId), "same feed -> same ids (delete + create window is idempotent)")
  for (const id of ids) assert.ok(id.startsWith(SHIFTS_ID_PREFIX), id)
  // Prefixed, so they can never overlap Deputy's "roster-123" / "timesheet-123" rows.
  assert.ok(ids.every((id) => !/^(roster|timesheet)-/.test(id)))
})

// ------------------------------------------------------------ roster rows

test("open shift detection: a null employee is open even if isOpen is false, and open shifts never carry cost", () => {
  const { roster } = labourRowsFromFeed(
    empty({
      shifts: [
        shift({ id: "a", employeeId: null, employeeName: null, isOpen: false, cost: 500 }),
        shift({ id: "b", employeeId: "", employeeName: "", isOpen: false, cost: 500 }),
        shift({ id: "c", employeeId: "e1", employeeName: "Yamil Awad", isOpen: true, cost: 500 }),
      ],
    }),
    []
  )
  for (const r of roster) {
    assert.equal(r.isOpen, true, r.deputyId)
    assert.equal(r.cost, 0, r.deputyId)
    assert.equal(r.payRate, null, r.deputyId)
    assert.equal(r.employeeId, null, r.deputyId)
    assert.equal(r.employeeName, "Open shift", r.deputyId)
  }
  assert.equal(roster[0].hours, 8) // hours still count for the open-shift $/hr display rule
})

test("roster hours: negative or zero feed hours fall back to the clock, end before start gives 0 not negative", () => {
  const { roster } = labourRowsFromFeed(
    empty({
      shifts: [
        shift({ id: "neg", hours: -3 }), // 8.5h clock less 30 min break
        shift({ id: "swap", start: "2026-10-07T04:30:00.000Z", end: "2026-10-06T20:00:00.000Z", hours: 0, cost: 100 }),
        shift({ id: "zero", start: "2026-10-06T20:00:00.000Z", end: "2026-10-06T20:00:00.000Z", hours: 0, breakMin: 30, cost: 0 }),
        shift({ id: "nobreak", hours: 0, breakMin: undefined }), // 8.5h
      ],
    }),
    []
  )
  const by = Object.fromEntries(roster.map((r) => [r.deputyId.replace(`${SHIFTS_ID_PREFIX}roster-`, ""), r]))
  assert.equal(by.neg.hours, 8)
  assert.equal(by.neg.payRate, 33)
  assert.equal(by.swap.hours, 0)
  assert.equal(by.swap.cost, 100) // cost kept as sent
  assert.equal(by.swap.payRate, null) // but never divided by zero hours
  assert.equal(by.zero.hours, 0)
  assert.equal(by.nobreak.hours, 8.5)
})

test("roster rows accept numeric strings and round to cents / 2dp hours", () => {
  const { roster } = labourRowsFromFeed(
    empty({ shifts: [shift({ hours: "7.4666" as unknown as number, cost: "264.004" as unknown as number })] }),
    []
  )
  assert.equal(roster[0].hours, 7.47)
  assert.equal(roster[0].cost, 264)
  assert.equal(roster[0].payRate, Math.round((264.004 / 7.4666) * 100) / 100)
})

test("roster names and areas are trimmed so bucketFor matches; blanks fall back to Employee <id> / null", () => {
  const { roster } = labourRowsFromFeed(
    empty({
      shifts: [
        shift({ id: "a", employeeName: "   ", area: " Kitchen " }),
        shift({ id: "b", employeeName: " Lacey Corby ", area: "   " }),
        shift({ id: "c", area: null }),
      ],
    }),
    []
  )
  assert.equal(roster[0].employeeName, "Employee e1")
  assert.equal(roster[0].area, "Kitchen")
  assert.equal(bucketFor("BURLEIGH", roster[0].area), "chefsKp")
  assert.equal(roster[1].employeeName, "Lacey Corby")
  assert.equal(roster[1].area, null)
  assert.equal(roster[2].area, null)
})

test("published is only true for a strict boolean true (strings and missing are unpublished)", () => {
  const { roster } = labourRowsFromFeed(
    empty({
      shifts: [
        shift({ id: "a", published: "true" as unknown as boolean }),
        shift({ id: "b", published: undefined as unknown as boolean }),
        shift({ id: "c", published: true }),
      ],
    }),
    []
  )
  assert.deepEqual(roster.map((r) => r.published), [false, false, true])
})

// --------------------------------------------------------- timesheet rows

test("live timesheets: clock skew (now before clockIn) gives 0 hours; a garbage clockOut is treated as still clocked on", () => {
  const now = new Date("2026-10-06T19:00:00.000Z") // an hour before clock-in
  const { timesheets } = labourRowsFromFeed(
    empty({
      timesheets: [
        sheet({ id: "skew", clockOut: null, hours: 0, cost: 0 }),
        sheet({ id: "garbage", clockOut: "not a date", hours: 0, cost: 0 }),
      ],
    }),
    [],
    now
  )
  assert.equal(timesheets[0].hours, 0)
  assert.equal(timesheets[0].shiftEnd.toISOString(), now.toISOString())
  assert.equal(timesheets[0].payRate, null)
  assert.equal(timesheets[1].shiftEnd.toISOString(), now.toISOString())
  assert.equal(timesheets[1].hours, 0)
})

test("timesheet with clockOut before clockIn and no hours is 0h; negative cost is 0; approved must be boolean true", () => {
  const { timesheets } = labourRowsFromFeed(
    empty({
      timesheets: [
        sheet({ clockIn: "2026-10-07T04:00:00.000Z", clockOut: "2026-10-06T20:00:00.000Z", hours: 0, cost: -12, approved: "true" as unknown as boolean }),
      ],
    }),
    []
  )
  assert.equal(timesheets[0].hours, 0)
  assert.equal(timesheets[0].cost, 0)
  assert.equal(timesheets[0].approved, false)
  assert.equal(timesheets[0].published, null)
})

test("a timesheet with a bad venue or clockIn is skipped and counted alongside skipped shifts", () => {
  const { timesheets, roster, skipped } = labourRowsFromFeed(
    empty({
      shifts: [shift({ venue: "PLUTO" as never })],
      timesheets: [
        sheet({ id: "a", venue: "PLUTO" as never }),
        sheet({ id: "b", clockIn: "" }),
        sheet({ id: "c" }),
      ],
    }),
    []
  )
  assert.equal(skipped, 3)
  assert.equal(roster.length, 0)
  assert.equal(timesheets.length, 1)
  assert.equal(timesheets[0].deputyId, `${SHIFTS_ID_PREFIX}timesheet-c`)
})

test("salaried timesheet rows stay $0 while the salary row carries the money: no double count in one feed", () => {
  const feed = empty({
    timesheets: [sheet({ id: "jess", area: "Pastry", employeeName: "Jessica Passos Le Rose", hours: 8, cost: 0 })],
    salaries: [{ venue: "BURLEIGH", bucket: "PASTRY", weeklyGross: 1650, headcount: 1 }],
  })
  const { roster, timesheets } = labourRowsFromFeed(feed, [WED])
  const total = [...roster, ...timesheets].reduce((s, r) => s + r.cost, 0)
  assert.equal(total, 1650)
  assert.equal(timesheets[0].payRate, null)
  assert.equal(roster[0].area, "Salary PASTRY BURLEIGH")
})

// -------------------------------------------------------------- forecasts

test("forecasts: numeric strings accepted, negatives / bad dates / bad venues dropped, key is UTC midnight DATE", () => {
  const { forecasts } = labourRowsFromFeed(
    empty({
      forecasts: [
        { venue: "BURLEIGH", weekStartWed: "2026-10-07", amount: "111500.004" as unknown as number, source: "manager" },
        { venue: "BURLEIGH", weekStartWed: "2026-10-7", amount: 1, source: "manager" },
        { venue: "BURLEIGH", weekStartWed: "2026-10-07T00:00:00Z", amount: 1, source: "manager" },
        { venue: "BEACH_HOUSE", weekStartWed: "2026-10-07", amount: -5, source: "lastYear" },
        { venue: "VENUS" as never, weekStartWed: "2026-10-07", amount: 5, source: "lastYear" },
      ],
    }),
    []
  )
  assert.equal(forecasts.length, 1)
  assert.equal(forecasts[0].amount, 111500)
  assert.equal(forecasts[0].weekStartWed.toISOString(), "2026-10-07T00:00:00.000Z")
  // Same key shape as startOfTarteWeekUtc, which is how ManagerSalesForecast rows are looked up.
  assert.equal(forecasts[0].weekStartWed.getTime(), startOfTarteWeekUtc(WED).getTime())
})

test("an empty feed maps to nothing and skips nothing", () => {
  assert.deepEqual(labourRowsFromFeed(empty(), [WED]), { roster: [], timesheets: [], skipped: 0, forecasts: [] })
})
