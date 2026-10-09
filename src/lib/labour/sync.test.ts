import { test } from "node:test"
import assert from "node:assert/strict"
import { ROSTER_WEEKS_AHEAD, shiftsRosterWindow, shiftsTimesheetWindowStart } from "./sync"

// Fri 9 Oct 2026 11:00 AEST (01:00 UTC); the trading week began Wed 7 Oct.
const NOW = new Date("2026-10-09T01:00:00.000Z")

test("roster window runs from Wed 00:00 AEST this week for current + 3 weeks (the GM horizon)", () => {
  const { start, end, weeks } = shiftsRosterWindow(NOW)
  assert.equal(start.toISOString(), "2026-10-06T14:00:00.000Z") // Wed 7 Oct 00:00 AEST
  assert.equal(end.toISOString(), "2026-11-03T14:00:00.000Z") // Wed 4 Nov 00:00 AEST
  assert.equal(weeks.length, ROSTER_WEEKS_AHEAD + 1)
  assert.deepEqual(
    weeks.map((w) => w.toISOString()),
    ["2026-10-06T14:00:00.000Z", "2026-10-13T14:00:00.000Z", "2026-10-20T14:00:00.000Z", "2026-10-27T14:00:00.000Z"]
  )
})

test("timesheet window starts at Wed 00:00 AEST of LAST week so late approvals re-sync", () => {
  assert.equal(shiftsTimesheetWindowStart(NOW).toISOString(), "2026-09-29T14:00:00.000Z")
})

test("a 4am Wednesday bakery shift (Tue 18:00 UTC) sits inside the new week, not the old one", () => {
  const { start } = shiftsRosterWindow(NOW)
  const bakery = new Date("2026-10-06T18:00:00.000Z")
  assert.ok(bakery >= start)
  // and Tuesday 11:59pm AEST is before it
  assert.ok(new Date("2026-10-06T13:59:00.000Z") < start)
})
