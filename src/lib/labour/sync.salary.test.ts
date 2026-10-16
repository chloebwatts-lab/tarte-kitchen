import { test } from "node:test"
import assert from "node:assert/strict"
import { shiftsRosterWindow, shiftsTimesheetWindowStart } from "./sync"
import { labourRowsFromFeed, SALARY_ID_PREFIX, type LabourRowInput, type ShiftsLabourFeed } from "@/lib/shifts/labour"

// The window filters syncLabourFromShifts applies to daily salary roll-up
// rows (16 Oct 2026): salary rows follow the timesheet window (from last
// Wednesday) while real roster rows keep the roster window. The DB side
// (delete + createMany in one transaction) is not tested here.

const NOW = new Date("2026-10-09T01:00:00.000Z") // Fri 9 Oct 2026 11am AEST, week of Wed 7 Oct

const isSalary = (r: LabourRowInput) => r.deputyId.startsWith(SALARY_ID_PREFIX)

/** Exactly the predicates in syncLabourFromShifts. */
function applySyncFilters(mapped: ReturnType<typeof labourRowsFromFeed>, now: Date) {
  const { start: rosterStart, end: rosterEnd } = shiftsRosterWindow(now)
  const tsStart = shiftsTimesheetWindowStart(now)
  const rosterRows = mapped.roster.filter((r) => !isSalary(r) && r.shiftStart >= rosterStart && r.shiftStart < rosterEnd)
  const tsRows = mapped.timesheets.filter((r) => r.shiftStart >= tsStart)
  const salaryRows = mapped.roster.filter((r) => isSalary(r) && r.shiftStart >= tsStart && r.shiftStart < rosterEnd)
  return { rosterRows, tsRows, salaryRows, rosterStart, rosterEnd, tsStart }
}

function shift(id: string, start: string) {
  return {
    id,
    venue: "BURLEIGH" as const,
    area: "Pastry",
    employeeId: "e1",
    employeeName: "Eden Lord",
    start,
    end: new Date(Date.parse(start) + 8 * 3600_000).toISOString(),
    hours: 8,
    cost: 0,
    isOpen: false,
    published: true,
    salaried: true,
  }
}

function daily(day: string, gross = 153.85, venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN" = "BURLEIGH") {
  return { venue, bucket: "PASTRY" as const, day, gross, headcount: 1 }
}

test("daily salary rows: last week's rows ride with the timesheet window, last week's real roster rows do not", () => {
  const feed: ShiftsLabourFeed = {
    ok: true,
    from: "2026-09-30",
    to: "2026-11-04",
    shifts: [
      shift("lastweek", "2026-10-02T20:00:00.000Z"), // Sat 3 Oct 6am AEST: roster history, left alone
      shift("thisweek", "2026-10-07T20:00:00.000Z"), // Thu 8 Oct 6am AEST
    ],
    timesheets: [],
    salaries: [
      daily("2026-09-29"), // Tue 29 Sep: before the timesheet window, dropped
      daily("2026-09-30"), // Wed 30 Sep 00:00 AEST = tsStart exactly: kept
      daily("2026-10-03"), // Sat 3 Oct, last week: kept (recode reads it on Friday)
      daily("2026-10-06"), // Tue 6 Oct, last day of last week: kept
      daily("2026-10-07"), // Wed 7 Oct = rosterStart: kept
      daily("2026-11-03"), // Tue 3 Nov, last day of the roster window: kept
      daily("2026-11-04"), // Wed 4 Nov = rosterEnd: dropped
    ],
  }
  const { weeks } = shiftsRosterWindow(NOW)
  const mapped = labourRowsFromFeed(feed, weeks, NOW)
  const { rosterRows, salaryRows, tsStart, rosterStart, rosterEnd } = applySyncFilters(mapped, NOW)

  assert.deepEqual(rosterRows.map((r) => r.deputyId), ["shifts-roster-thisweek"])
  assert.ok(rosterRows.every((r) => !isSalary(r)), "salary rows never ride in the roster set")
  assert.deepEqual(
    salaryRows.map((r) => r.deputyId.slice(SALARY_ID_PREFIX.length)).sort(),
    ["BURLEIGH-PASTRY-2026-09-30", "BURLEIGH-PASTRY-2026-10-03", "BURLEIGH-PASTRY-2026-10-06", "BURLEIGH-PASTRY-2026-10-07", "BURLEIGH-PASTRY-2026-11-03"]
  )
  for (const r of salaryRows) {
    assert.ok(r.shiftStart >= tsStart && r.shiftStart < rosterEnd)
    assert.equal(r.source, "ROSTER")
    assert.equal(r.salaried, true)
    assert.equal(r.hours, 0)
  }
  // The Wed 30 Sep row sits exactly on tsStart, the Wed 7 Oct row exactly on rosterStart.
  assert.equal(salaryRows.find((r) => r.deputyId.endsWith("2026-09-30"))!.shiftStart.getTime(), tsStart.getTime())
  assert.equal(salaryRows.find((r) => r.deputyId.endsWith("2026-10-07"))!.shiftStart.getTime(), rosterStart.getTime())
  // The sync's roster counters still add up: upserted + skipped = mapped + feed-skipped.
  const skipped = mapped.skipped + (mapped.roster.length - rosterRows.length - salaryRows.length)
  assert.equal(skipped, 3) // lastweek shift, 29 Sep and 4 Nov salary days
  assert.equal(rosterRows.length + salaryRows.length + skipped, mapped.roster.length + mapped.skipped)
})

test("daily salary rows never depend on the roster weeks: same rows with zero or four weeks", () => {
  const feed: ShiftsLabourFeed = {
    ok: true,
    from: "2026-09-30",
    to: "2026-11-04",
    shifts: [],
    timesheets: [],
    salaries: [daily("2026-10-08"), daily("2026-10-09", 200, "BEACH_HOUSE")],
  }
  const { weeks } = shiftsRosterWindow(NOW)
  const a = labourRowsFromFeed(feed, [], NOW)
  const b = labourRowsFromFeed(feed, weeks, NOW)
  assert.deepEqual(a, b)
  assert.equal(a.roster.length, 2)
})

test("mixed feed: a weekly-form group and daily-form groups coexist, weekly rows land on roster weeks only", () => {
  const feed: ShiftsLabourFeed = {
    ok: true,
    from: "2026-09-30",
    to: "2026-11-04",
    shifts: [],
    timesheets: [],
    salaries: [
      { venue: "TEA_GARDEN", bucket: "FOH_BARISTA", weeklyGross: 1400, headcount: 1 }, // old form
      daily("2026-10-03"), // last week, daily form
      daily("2026-10-08"),
    ],
  }
  const { weeks } = shiftsRosterWindow(NOW)
  const mapped = labourRowsFromFeed(feed, weeks, NOW)
  const { salaryRows, rosterStart } = applySyncFilters(mapped, NOW)
  const tg = salaryRows.filter((r) => r.venue === "TEA_GARDEN")
  assert.equal(tg.length, weeks.length)
  assert.deepEqual(tg.map((r) => r.shiftStart.toISOString()), weeks.map((w) => w.toISOString()))
  // Weekly form has no row for last week: it was never dated there.
  assert.ok(tg.every((r) => r.shiftStart >= rosterStart))
  const burleigh = salaryRows.filter((r) => r.venue === "BURLEIGH")
  assert.equal(burleigh.length, 2)
  assert.equal(new Set(salaryRows.map((r) => r.deputyId)).size, salaryRows.length, "ids unique")
})
