import { test } from "node:test"
import assert from "node:assert/strict"
import {
  aestDateIso,
  labourRowsFromFeed,
  SALARY_PLACEHOLDER_AREA,
  SHIFTS_ID_PREFIX,
  ShiftsFeedError,
  tarteWeekStartInstant,
  type ShiftsLabourFeed,
} from "./labour"
import { bucketFor } from "@/lib/labour/buckets"

// Wed 7 Oct 2026 00:00 AEST = Tue 6 Oct 14:00 UTC
const WED = new Date("2026-10-06T14:00:00.000Z")
const NEXT_WED = new Date("2026-10-13T14:00:00.000Z")

function feed(over: Partial<ShiftsLabourFeed> = {}): ShiftsLabourFeed {
  return {
    ok: true,
    from: "2026-09-30",
    to: "2026-11-04",
    shifts: [
      {
        id: "sh1",
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
      },
      {
        id: "sh2",
        venue: "BEACH_HOUSE",
        area: "Cafe FOH",
        employeeId: null,
        employeeName: null,
        start: "2026-10-10T21:00:00.000Z", // Sun 7am AEST
        end: "2026-10-11T05:00:00.000Z",
        hours: 8,
        cost: 0,
        isOpen: true,
        published: false,
      },
    ],
    timesheets: [
      {
        id: "ts1",
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
      },
      {
        id: "ts2",
        venue: "BURLEIGH",
        area: "Pastry",
        employeeId: "e3",
        employeeName: "Jessica Passos Le Rose",
        clockIn: "2026-10-07T18:00:00.000Z", // salaried: $0, still clocked on
        clockOut: null,
        hours: 2,
        cost: 0,
        approved: false,
      },
    ],
    salaries: [
      { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 2946.34, headcount: 2 },
      { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 1250, headcount: 1 },
      { venue: "BURLEIGH", bucket: "FOH_BARISTA", weeklyGross: 4780.77, headcount: 4 },
      { venue: "TEA_GARDEN", bucket: "FOH_BARISTA", weeklyGross: 1400, headcount: 1 },
      { venue: "BEACH_HOUSE", bucket: "PASTRY", weeklyGross: 0, headcount: 0 },
    ],
    forecasts: [
      { venue: "BURLEIGH", weekStartWed: "2026-10-07", amount: 111500, source: "manager" },
      { venue: "BEACH_HOUSE", weekStartWed: "2026-10-07", amount: 0, source: "lastYear" },
      { venue: "BEACH_HOUSE", weekStartWed: "2026-10-08", amount: 96000, source: "manager" }, // a Thursday: dropped
    ],
    ...over,
  }
}

test("tarteWeekStartInstant: Wed 00:00 AEST as a UTC instant, from any day of the week", () => {
  // Fri 9 Oct 2026 11:00 AEST
  assert.equal(tarteWeekStartInstant(new Date("2026-10-09T01:00:00.000Z")).toISOString(), WED.toISOString())
  // Tue 13 Oct 11:30pm AEST still belongs to the week of Wed 7 Oct
  assert.equal(tarteWeekStartInstant(new Date("2026-10-13T13:30:00.000Z")).toISOString(), WED.toISOString())
  // Wed 14 Oct 00:00 AEST starts the next week
  assert.equal(tarteWeekStartInstant(NEXT_WED).toISOString(), NEXT_WED.toISOString())
  assert.equal(aestDateIso(WED), "2026-10-07")
})

test("roster shifts become ROSTER rows with the Deputy-era shape and a shifts- id", () => {
  const { roster } = labourRowsFromFeed(feed({ salaries: [] }), [])
  assert.equal(roster.length, 2)
  const [yamil, open] = roster
  assert.equal(yamil.deputyId, `${SHIFTS_ID_PREFIX}roster-sh1`)
  assert.equal(yamil.source, "ROSTER")
  assert.equal(yamil.employeeName, "Yamil Awad")
  assert.equal(yamil.employeeId, "e1")
  assert.equal(yamil.venue, "BURLEIGH")
  assert.equal(yamil.area, "Kitchen")
  assert.equal(yamil.hours, 8)
  assert.equal(yamil.cost, 264)
  assert.equal(yamil.payRate, 33)
  assert.equal(yamil.isOpen, false)
  assert.equal(yamil.published, true)
  assert.equal(yamil.approved, false)
  assert.equal(yamil.shiftStart.toISOString(), "2026-10-06T20:00:00.000Z")
  // Open shift: no name, cost 0 (Kitchen applies its own open-shift $/hr at display)
  assert.equal(open.isOpen, true)
  assert.equal(open.employeeId, null)
  assert.equal(open.employeeName, "Open shift")
  assert.equal(open.cost, 0)
  assert.equal(open.payRate, null)
  assert.equal(open.published, false)
})

test("timesheets become TIMESHEET rows; a live row ends at now; salaried rows keep $0", () => {
  const now = new Date("2026-10-07T20:00:00.000Z")
  const { timesheets } = labourRowsFromFeed(feed(), [], now)
  assert.equal(timesheets.length, 2)
  const [lacey, jess] = timesheets
  assert.equal(lacey.deputyId, `${SHIFTS_ID_PREFIX}timesheet-ts1`)
  assert.equal(lacey.source, "TIMESHEET")
  assert.equal(lacey.approved, true)
  assert.equal(lacey.hours, 7.47)
  assert.equal(lacey.cost, 240.3)
  assert.equal(lacey.payRate, Math.round((240.3 / 7.47) * 100) / 100)
  assert.equal(lacey.published, null)
  assert.equal(lacey.isOpen, false)
  assert.equal(jess.shiftEnd.toISOString(), now.toISOString())
  assert.equal(jess.cost, 0)
  assert.equal(jess.payRate, null)
  assert.equal(jess.approved, false)
})

test("salary roll-ups: one placeholder ROSTER row per venue + bucket per roster week, under the Deputy card names", () => {
  const { roster } = labourRowsFromFeed(feed({ shifts: [] }), [WED, NEXT_WED])
  // 3 non-zero (venue, bucket) groups x 2 weeks; the $0 Beach House pastry group is dropped
  assert.equal(roster.length, 6)
  const boh = roster.filter((r) => r.area === "Salary BOH BURLEIGH")
  assert.equal(boh.length, 2)
  assert.equal(boh[0].cost, 4196.34) // 2946.34 + 1250 summed into one card
  assert.equal(boh[0].employeeName, "Salary BOH BURLEIGH")
  assert.equal(boh[0].hours, 0)
  assert.equal(boh[0].isOpen, false)
  assert.equal(boh[0].published, true)
  assert.equal(boh[0].shiftStart.toISOString(), WED.toISOString())
  assert.equal(boh[1].shiftStart.toISOString(), NEXT_WED.toISOString())
  assert.equal(boh[0].deputyId, `${SHIFTS_ID_PREFIX}salary-BURLEIGH-CHEFS_KP-2026-10-07`)
  assert.equal(roster.find((r) => r.venue === "BURLEIGH" && r.area === "Salary FOH BURLEIGH")?.cost, 4780.77)
  assert.equal(roster.find((r) => r.venue === "TEA_GARDEN")?.area, "Salary TG FOH")
  // Every placeholder name lands in the bucket it stands for, like Deputy's cards did.
  for (const venue of ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as const) {
    assert.equal(bucketFor(venue, SALARY_PLACEHOLDER_AREA[venue].CHEFS_KP), "chefsKp", venue)
    assert.equal(bucketFor(venue, SALARY_PLACEHOLDER_AREA[venue].FOH_BARISTA), "fohBarista", venue)
    assert.equal(bucketFor(venue, SALARY_PLACEHOLDER_AREA[venue].PASTRY), "pastry", venue)
    assert.equal(bucketFor(venue, SALARY_PLACEHOLDER_AREA[venue].OTHER), "other", venue)
  }
  // Placeholder names are what the live tracker and line-up already key on.
  for (const r of roster) assert.match(r.area ?? "", /^Salary\b/)
})

test("forecasts: only positive amounts with a proper week date, as UTC-midnight DATE keys", () => {
  const { forecasts } = labourRowsFromFeed(feed(), [])
  assert.equal(forecasts.length, 1)
  assert.equal(forecasts[0].venue, "BURLEIGH")
  assert.equal(forecasts[0].amount, 111500)
  assert.equal(forecasts[0].weekStartWed.toISOString(), "2026-10-07T00:00:00.000Z")
})

test("bad rows are skipped, never thrown: unknown venue, unparseable dates, missing hours fall back to the clock", () => {
  const f = feed({
    shifts: [
      { id: "x", venue: "MARS" as never, area: null, employeeId: "e", employeeName: "A", start: "2026-10-07T00:00:00Z", end: "2026-10-07T01:00:00Z", hours: 1, cost: 1, isOpen: false, published: true },
      { id: "y", venue: "BURLEIGH", area: "FOH", employeeId: "e", employeeName: "B", start: "not a date", end: "2026-10-07T01:00:00Z", hours: 1, cost: 1, isOpen: false, published: true },
      { id: "z", venue: "BURLEIGH", area: "FOH", employeeId: "e", employeeName: "C", start: "2026-10-07T00:00:00Z", end: "2026-10-07T04:30:00Z", breakMin: 30, hours: 0, cost: -5, isOpen: false, published: true },
    ],
    timesheets: [],
    salaries: [],
  })
  const { roster, skipped } = labourRowsFromFeed(f, [])
  assert.equal(skipped, 2)
  assert.equal(roster.length, 1)
  assert.equal(roster[0].hours, 4) // 4.5h clock less 30 min break
  assert.equal(roster[0].cost, 0) // negative cost never stored
})

test("ShiftsFeedError knows a missing endpoint from a dead one", () => {
  assert.equal(new ShiftsFeedError("x", 404).missingEndpoint, true)
  assert.equal(new ShiftsFeedError("x", 502).missingEndpoint, false)
  assert.equal(new ShiftsFeedError("x", 0).missingEndpoint, false)
})

test("daily salary roll-ups: one placeholder row per venue + bucket + day at that day's 00:00 AEST, salaried flag set", () => {
  const f = feed({
    shifts: [],
    timesheets: [],
    salaries: [
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-07", gross: 461.54, headcount: 2 },
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-07", gross: 100, headcount: 1 }, // same group twice: summed
      { venue: "BEACH_HOUSE", bucket: "PASTRY", day: "2026-10-10", gross: 153.85, headcount: 1 },
      { venue: "BEACH_HOUSE", bucket: "PASTRY", day: "2026-10-11", gross: 0, headcount: 1 }, // nothing placed: dropped
      { venue: "BEACH_HOUSE", bucket: "PASTRY", day: "10/10/2026", gross: 50, headcount: 1 }, // bad day, no weeklyGross: dropped
    ],
  })
  const { roster } = labourRowsFromFeed(f, [WED, NEXT_WED])
  assert.equal(roster.length, 2) // daily entries never multiply by roster weeks
  const wed = roster.find((r) => r.deputyId === `${SHIFTS_ID_PREFIX}salary-BURLEIGH-PASTRY-2026-10-07`)!
  assert.equal(wed.cost, 561.54)
  assert.equal(wed.area, "Salary PASTRY BURLEIGH")
  assert.equal(wed.shiftStart.toISOString(), "2026-10-06T14:00:00.000Z") // Wed 00:00 AEST
  assert.equal(wed.hours, 0)
  assert.equal(wed.salaried, true)
  assert.equal(wed.source, "ROSTER")
  const sat = roster.find((r) => r.venue === "BEACH_HOUSE")!
  assert.equal(sat.cost, 153.85)
  assert.equal(sat.shiftStart.toISOString(), "2026-10-09T14:00:00.000Z")
  assert.equal(sat.area, "Salary Pastry Currumbin")
})

test("salaried shifts and timesheets carry the flag; hourly rows do not", () => {
  const f = feed({
    shifts: [
      { id: "s1", venue: "BURLEIGH", area: "Pastry", employeeId: "e1", employeeName: "Eden Lord", start: "2026-10-07T00:00:00Z", end: "2026-10-07T08:00:00Z", hours: 8, cost: 0, isOpen: false, published: true, salaried: true },
      { id: "s2", venue: "BURLEIGH", area: "FOH", employeeId: "e2", employeeName: "Lacey Corby", start: "2026-10-07T00:00:00Z", end: "2026-10-07T08:00:00Z", hours: 8, cost: 264, isOpen: false, published: true },
    ],
    timesheets: [
      { id: "t1", venue: "BURLEIGH", area: "Pastry", employeeId: "e1", employeeName: "Eden Lord", clockIn: "2026-10-07T00:00:00Z", clockOut: "2026-10-07T08:00:00Z", hours: 8, cost: 0, approved: true, salaried: true },
    ],
    salaries: [],
  })
  const { roster, timesheets } = labourRowsFromFeed(f, [])
  assert.equal(roster.find((r) => r.employeeName === "Eden Lord")?.salaried, true)
  assert.equal(roster.find((r) => r.employeeName === "Lacey Corby")?.salaried, false)
  assert.equal(timesheets[0].salaried, true)
})

test("daily salary rows: every AEST day of a trading week lands inside the recode window for that week, the next Wednesday does not", () => {
  // recodeLabourWeek reads [weekStartWed UTC-midnight - 10h, +7d).
  const weekStartWed = new Date("2026-10-07T00:00:00.000Z")
  const windowStart = new Date(weekStartWed.getTime() - 10 * 3600 * 1000)
  const windowEnd = new Date(windowStart.getTime() + 7 * 86400 * 1000)
  const days = ["2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14"]
  const f = feed({
    shifts: [],
    timesheets: [],
    salaries: days.map((day) => ({ venue: "BURLEIGH" as const, bucket: "CHEFS_KP" as const, day, gross: 210.33, headcount: 1 })),
  })
  const { roster } = labourRowsFromFeed(f, [])
  assert.equal(roster.length, 9)
  const inWindow = roster.filter((r) => r.shiftStart >= windowStart && r.shiftStart < windowEnd).map((r) => r.deputyId.slice(-10)).sort()
  assert.deepEqual(inWindow, ["2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"])
  // Wed 7 Oct's row is the very first instant of the window; Tue 6 Oct's is the last week.
  assert.equal(roster.find((r) => r.deputyId.endsWith("2026-10-07"))!.shiftStart.getTime(), windowStart.getTime())
  assert.ok(roster.find((r) => r.deputyId.endsWith("2026-10-06"))!.shiftStart < windowStart)
  assert.ok(roster.find((r) => r.deputyId.endsWith("2026-10-14"))!.shiftStart >= windowEnd)
  // One week of a $1,472.31 salary placed every day sums back to the week (2 cent rounding at most).
  const week = roster.filter((r) => r.shiftStart >= windowStart && r.shiftStart < windowEnd).reduce((s, r) => s + r.cost, 0)
  assert.ok(Math.abs(week - 1472.31) < 0.02, String(week))
  assert.equal(new Set(roster.map((r) => r.deputyId)).size, 9)
  for (const r of roster) assert.equal(bucketFor(r.venue, r.area), "chefsKp")
})

test("daily salary rows: nasty gross values are dropped, never stored as negative or NaN", () => {
  const f = feed({
    shifts: [],
    timesheets: [],
    salaries: [
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-07", gross: -50, headcount: 1 },
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-08", gross: Number.NaN, headcount: 1 },
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-09", gross: "abc" as never, headcount: 1 },
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-10", headcount: 1 }, // neither gross nor weeklyGross
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-10-11", gross: "153.85" as never, headcount: 1 }, // numeric string: accepted
      { venue: "BURLEIGH", bucket: "PASTRY", day: "2026-13-40", gross: 100, headcount: 1 }, // shape ok, impossible date
      { venue: "MARS" as never, bucket: "PASTRY", day: "2026-10-07", gross: 100, headcount: 1 },
      { venue: "BURLEIGH", bucket: "ADMIN" as never, day: "2026-10-07", gross: 100, headcount: 1 },
    ],
  })
  const { roster } = labourRowsFromFeed(f, [WED])
  assert.equal(roster.length, 1)
  assert.equal(roster[0].deputyId, `${SHIFTS_ID_PREFIX}salary-BURLEIGH-PASTRY-2026-10-11`)
  assert.equal(roster[0].cost, 153.85)
  for (const r of roster) assert.ok(Number.isFinite(r.cost) && r.cost >= 0)
})

test("salaried flag: absent or non-boolean never flags a row; open shifts are never salaried", () => {
  const f = feed({
    shifts: [
      { id: "s1", venue: "BURLEIGH", area: "Pastry", employeeId: "e1", employeeName: "Eden Lord", start: "2026-10-07T00:00:00Z", end: "2026-10-07T08:00:00Z", hours: 8, cost: 0, isOpen: false, published: true, salaried: "true" as never },
      { id: "s2", venue: "BURLEIGH", area: "Pastry", employeeId: null, employeeName: null, start: "2026-10-07T00:00:00Z", end: "2026-10-07T08:00:00Z", hours: 8, cost: 0, isOpen: true, published: true, salaried: true },
    ],
    timesheets: [
      { id: "t1", venue: "BURLEIGH", area: "Pastry", employeeId: "e1", employeeName: "Eden Lord", clockIn: "2026-10-07T00:00:00Z", clockOut: "2026-10-07T08:00:00Z", hours: 8, cost: 0, approved: true },
    ],
    salaries: [],
  })
  const { roster, timesheets } = labourRowsFromFeed(f, [])
  assert.equal(roster[0].salaried, false)
  assert.equal(roster[1].isOpen, true)
  // The mapper passes the feed's flag through for open shifts too; it is harmless (cost 0, no name) but noted.
  assert.equal(typeof roster[1].salaried, "boolean")
  assert.equal(timesheets[0].salaried, false)
})
