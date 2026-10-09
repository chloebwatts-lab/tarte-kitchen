import { test } from "node:test"
import assert from "node:assert/strict"
import { ROSTER_WEEKS_AHEAD, shiftsRosterWindow, shiftsTimesheetWindowStart } from "./sync"
import { labourRowsFromFeed, type ShiftsLabourFeed } from "@/lib/shifts/labour"

// Pure window maths and the window filters syncLabourFromShifts applies
// before its delete + create. The DB side is not tested here.

const DAY = 86400_000
const WED = "2026-10-06T14:00:00.000Z" // Wed 7 Oct 00:00 AEST
const PREV_WED = "2026-09-29T14:00:00.000Z"

test("one millisecond either side of Wed 00:00 AEST picks the right week for both windows", () => {
  const before = new Date("2026-10-06T13:59:59.999Z")
  const at = new Date("2026-10-06T14:00:00.000Z")
  assert.equal(shiftsRosterWindow(before).start.toISOString(), PREV_WED)
  assert.equal(shiftsRosterWindow(at).start.toISOString(), WED)
  assert.equal(shiftsTimesheetWindowStart(before).toISOString(), "2026-09-22T14:00:00.000Z")
  assert.equal(shiftsTimesheetWindowStart(at).toISOString(), PREV_WED)
})

test("a Sunday (weekday 0) and the new year still start on a Wednesday 00:00 AEST", () => {
  const sun = new Date("2026-10-11T04:00:00.000Z") // Sun 11 Oct 2pm AEST
  assert.equal(shiftsRosterWindow(sun).start.toISOString(), WED)
  const ny = new Date("2027-01-01T00:00:00.000Z") // Fri 1 Jan 2027 10am AEST
  const w = shiftsRosterWindow(ny)
  assert.equal(w.start.toISOString(), "2026-12-29T14:00:00.000Z")
  assert.equal(w.end.toISOString(), "2027-01-26T14:00:00.000Z")
})

test("roster window is exactly (ROSTER_WEEKS_AHEAD + 1) x 7 days, weeks 7 days apart and all inside [start, end)", () => {
  const from = Date.parse("2026-09-01T00:00:00.000Z")
  for (let t = from; t < from + 60 * DAY; t += 5 * 3600_000) {
    const now = new Date(t)
    const { start, end, weeks } = shiftsRosterWindow(now)
    assert.equal(end.getTime() - start.getTime(), (ROSTER_WEEKS_AHEAD + 1) * 7 * DAY)
    assert.equal(weeks.length, ROSTER_WEEKS_AHEAD + 1)
    assert.equal(weeks[0].getTime(), start.getTime())
    for (let i = 0; i < weeks.length; i++) {
      assert.equal(weeks[i].getTime(), start.getTime() + i * 7 * DAY)
      assert.ok(weeks[i] >= start && weeks[i] < end)
      // every week boundary is Wed 00:00 AEST
      const aest = new Date(weeks[i].getTime() + 10 * 3600_000)
      assert.equal(aest.getUTCDay(), 3)
      assert.equal(aest.getUTCHours(), 0)
    }
    assert.equal(weeks[weeks.length - 1].getTime() + 7 * DAY, end.getTime())
    // the timesheet window always begins exactly one week before the roster window
    assert.equal(shiftsTimesheetWindowStart(now).getTime(), start.getTime() - 7 * DAY)
    // and now always sits inside the current week
    assert.ok(now >= start && now < new Date(start.getTime() + 7 * DAY))
  }
})

test("sync's window filters: every salary row survives, boundary shifts fall the right side, last week's roster is not rewritten", () => {
  const now = new Date("2026-10-09T01:00:00.000Z") // Fri 9 Oct 11am AEST
  const { start: rosterStart, end: rosterEnd, weeks } = shiftsRosterWindow(now)
  const tsStart = shiftsTimesheetWindowStart(now)
  const mk = (id: string, start: string) => ({
    id,
    venue: "BURLEIGH" as const,
    area: "Kitchen",
    employeeId: "e1",
    employeeName: "Yamil Awad",
    start,
    end: new Date(Date.parse(start) + 8 * 3600_000).toISOString(),
    hours: 8,
    cost: 264,
    isOpen: false,
    published: true,
  })
  const feed: ShiftsLabourFeed = {
    ok: true,
    from: "2026-09-30",
    to: "2026-11-04",
    shifts: [
      mk("lastweek", "2026-10-05T20:00:00.000Z"), // Tue 6 Oct 6am AEST: feed sends it (from = last Wed) but it is roster history
      mk("tue-2359", "2026-10-06T13:59:00.000Z"), // Tue 6 Oct 11:59pm AEST, still last week
      mk("wed-0000", rosterStart.toISOString()), // first instant of the window
      mk("bakery-4am", "2026-10-06T18:00:00.000Z"), // Wed 4am AEST, Tue in UTC
      mk("last-tue", "2026-11-03T13:00:00.000Z"), // Tue 3 Nov 11pm AEST, last day of the window
      mk("at-end", rosterEnd.toISOString()), // Wed 4 Nov 00:00 AEST, excluded (feed's `to` is exclusive)
    ],
    timesheets: [
      {
        id: "late-approval",
        venue: "BURLEIGH",
        area: "FOH",
        employeeId: "e2",
        employeeName: "Lacey Corby",
        clockIn: "2026-10-01T20:00:00.000Z", // Fri 2 Oct, last week: re-synced for late approvals
        clockOut: "2026-10-02T04:00:00.000Z",
        hours: 7.5,
        cost: 240,
        approved: true,
      },
      {
        id: "too-old",
        venue: "BURLEIGH",
        area: "FOH",
        employeeId: "e2",
        employeeName: "Lacey Corby",
        clockIn: "2026-09-29T13:59:00.000Z", // Tue 29 Sep 11:59pm AEST, before the window
        clockOut: "2026-09-29T22:00:00.000Z",
        hours: 7.5,
        cost: 240,
        approved: true,
      },
    ],
    salaries: [
      { venue: "BURLEIGH", bucket: "CHEFS_KP", weeklyGross: 4196.34, headcount: 3 },
      { venue: "BEACH_HOUSE", bucket: "FOH_BARISTA", weeklyGross: 2500, headcount: 2 },
      { venue: "TEA_GARDEN", bucket: "FOH_BARISTA", weeklyGross: 1400, headcount: 1 },
    ],
  }
  const mapped = labourRowsFromFeed(feed, weeks, now)
  // Same predicates as syncLabourFromShifts.
  const rosterRows = mapped.roster.filter((r) => r.shiftStart >= rosterStart && r.shiftStart < rosterEnd)
  const tsRows = mapped.timesheets.filter((r) => r.shiftStart >= tsStart)

  const kept = rosterRows.map((r) => r.deputyId.replace(/^shifts-roster-/, "")).filter((id) => !id.startsWith("shifts-salary-"))
  assert.deepEqual(kept.sort(), ["bakery-4am", "last-tue", "wed-0000"].sort())
  const salaryRows = rosterRows.filter((r) => r.deputyId.startsWith("shifts-salary-"))
  assert.equal(salaryRows.length, 3 * weeks.length, "3 groups x 4 weeks, none filtered out")
  assert.equal(mapped.roster.length - rosterRows.length, 3, "lastweek, tue-2359 and at-end are reported as skipped")
  assert.deepEqual(tsRows.map((r) => r.deputyId), ["shifts-timesheet-late-approval"])

  // Salary rows for a given venue + bucket: one per week, dated at each week boundary, ids unique.
  const boh = salaryRows.filter((r) => r.area === "Salary BOH BURLEIGH")
  assert.deepEqual(boh.map((r) => r.shiftStart.toISOString()), weeks.map((w) => w.toISOString()))
  assert.equal(new Set(salaryRows.map((r) => r.deputyId)).size, salaryRows.length)
  // Each week's wage total gets the weekly gross once per group, so the current
  // week's fixed cost is 4196.34 + 2500 + 1400 and not that times 4.
  const thisWeek = salaryRows.filter((r) => r.shiftStart.getTime() === rosterStart.getTime())
  assert.equal(Math.round(thisWeek.reduce((s, r) => s + r.cost, 0) * 100) / 100, 8096.34)
})

test("mapping the same feed twice yields identical rows, so a re-run of the delete + create window is a no-op", () => {
  const now = new Date("2026-10-09T01:00:00.000Z")
  const { weeks } = shiftsRosterWindow(now)
  const feed: ShiftsLabourFeed = {
    ok: true,
    from: "2026-09-30",
    to: "2026-11-04",
    shifts: [],
    timesheets: [],
    salaries: [{ venue: "BURLEIGH", bucket: "FOH_BARISTA", weeklyGross: 4780.77, headcount: 4 }],
  }
  const a = labourRowsFromFeed(feed, weeks, now)
  const b = labourRowsFromFeed(feed, weeks, now)
  assert.deepEqual(a, b)
})
