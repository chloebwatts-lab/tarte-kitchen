import { test } from "node:test"
import assert from "node:assert/strict"
import { recoveryPlan, venueWageTarget } from "./recovery"
import { buildLiveLabourSnapshot, type LiveLabourRows, type LiveVenueSnapshot, type LiveBucketRow } from "./live"

const near = (a: number | null | undefined, b: number, msg?: string) => assert.ok(a != null && Math.abs(a - b) < 0.011, `${msg ?? ""} got ${a}, want ${b}`)

function bucket(over: Partial<LiveBucketRow> & Pick<LiveBucketRow, "key" | "label">): LiveBucketRow {
  return {
    target: null,
    spentToDate: 0,
    projectedTotal: 0,
    projectedPct: null,
    status: "no-target",
    varianceVsBandPct: null,
    paidLeave: 0,
    workingPct: null,
    workingStatus: "no-target",
    workingVarianceVsBandPct: null,
    rosterStillToRun: 0,
    ...over,
  }
}

/** Beach House, Mon 23 Nov 2026 at 7:59 pm, as on Chloe's screenshot. */
function beachHouse(over: Partial<LiveVenueSnapshot> = {}): LiveVenueSnapshot {
  const revenue = 96336
  return {
    venue: "BEACH_HOUSE",
    label: "Tarte Beach House (Currumbin)",
    labourToDate: 0,
    labourProjected: 37626 + 1508,
    revenueToDate: 86764,
    revenueProjected: revenue,
    revenueLastWeekSameDays: null,
    revenueVsLastWeekPct: null,
    revenueLastWeekTotal: null,
    overallProjectedPct: null,
    paidLeave: 1508,
    workingProjectedPct: (37626 / revenue) * 100,
    locked: { labour: 28913 + 1293, revenue: 75684, pct: null, days: 5, paidLeave: 1293, workingPct: (28913 / 75684) * 100 },
    today: { live: true, labourSoFar: 4521, revenueSoFar: 10726, shareOfDayDone: 1, revenueRestOfDay: 0, labourRestOfDay: 0 },
    rosterStillToRun: 4193,
    revenueStillToCome: 9572,
    days: [],
    buckets: [
      bucket({ key: "chefsKp", label: "Chefs + KP", target: { key: "chefsKp", label: "Chefs + KP", min: 12.5, max: 13.5 }, projectedTotal: 0.145 * revenue, workingPct: 14.5, rosterStillToRun: 1400 }),
      bucket({ key: "fohBarista", label: "FOH (incl. Barista)", target: { key: "fohBarista", label: "FOH (incl. Barista)", min: 21.5, max: 22.5 }, projectedTotal: 0.21 * revenue, workingPct: 21, rosterStillToRun: 2400 }),
    ],
    coverage: { daysLocked: 5, daysRemaining: 1, asOf: "2026-11-23T09:59:00.000Z" },
    ...over,
  }
}

test("venue target is the band tops added up: Beach House 39, Burleigh 38.25, Tea Garden none", () => {
  assert.equal(venueWageTarget("BEACH_HOUSE"), 39)
  assert.equal(venueWageTarget("BURLEIGH"), 38.25)
  assert.equal(venueWageTarget("TEA_GARDEN"), null)
  assert.equal(recoveryPlan(beachHouse({ venue: "TEA_GARDEN" })), null)
})

test("Chloe's screenshot: Wed to Sun under target, week $55 over, either cut $55 of Tuesday's roster or take $141 more", () => {
  const p = recoveryPlan(beachHouse())!
  assert.equal(p.targetPct, 39)
  near(p.soFar!.overTarget, 28913 - 0.39 * 75684, "Wed to Sun") // -603.76, under
  near(p.gap, 37626 - 0.39 * 96336) // 54.96
  assert.equal(p.onTrack, false)
  near(p.wagesToCut, 54.96)
  near(p.stillToRun, 4193)
  assert.equal(p.wagesOutOfReach, false)
  near(p.extraTakings, 54.96 / 0.39) // 140.92
  near(p.extraTakingsPct, (54.96 / 0.39 / 9572) * 100) // about 1.5%
  // The rest of the week (Mon and Tue) may cost at most target x week takings less what Wed to Sun cost.
  near(p.rest.maxWagesForTarget, 0.39 * 96336 - 28913)
  near(p.rest.wages, 37626 - 28913)
  near(p.rest.revenue, 96336 - 75684)
  // Chefs + KP is a point over its 13.5% top: about $963. FOH is inside its band, so it is not listed.
  assert.deepEqual(p.depts.map((d) => d.label), ["Chefs + KP"])
  near(p.depts[0].over, 0.01 * 96336)
  assert.equal(p.depts[0].outOfReach, false)
})

test("teams first: Beach House is only $55 over as a week, but Chefs + KP alone is $963 over, so the cut asked for is $963", () => {
  const p = recoveryPlan(beachHouse())!
  near(p.teamsOver, 963.36)
  near(p.cutToFix, 963.36)
  // A second team over adds on; a team under its band never offsets one over.
  const two = recoveryPlan(beachHouse({
    buckets: [
      bucket({ key: "chefsKp", label: "Chefs + KP", target: { key: "chefsKp", label: "Chefs + KP", min: 12.5, max: 13.5 }, projectedTotal: 0.145 * 96336, workingPct: 14.5 }),
      bucket({ key: "pastry", label: "Pastry", target: { key: "pastry", label: "Pastry", min: 2.5, max: 3 }, projectedTotal: 0.035 * 96336, workingPct: 3.5 }),
      bucket({ key: "fohBarista", label: "FOH (incl. Barista)", target: { key: "fohBarista", label: "FOH (incl. Barista)", min: 21.5, max: 22.5 }, projectedTotal: 0.18 * 96336, workingPct: 18 }),
    ],
  }))!
  near(two.teamsOver, 0.015 * 96336)
  near(two.cutToFix, 0.015 * 96336)
})

test("the week gap wins when it is bigger than the teams over (overspend outside the bands, e.g. admin)", () => {
  const p = recoveryPlan(beachHouse({ labourProjected: 40000 + 1508 }))!
  near(p.gap, 40000 - 0.39 * 96336)
  near(p.cutToFix, 40000 - 0.39 * 96336)
})

test("nothing over anywhere: no cut", () => {
  const p = recoveryPlan(beachHouse({ labourProjected: 36000 + 1508, buckets: [] }))!
  assert.equal(p.teamsOver, 0)
  assert.equal(p.cutToFix, null)
})

test("on track: room to spare, no cut and no extra takings asked for", () => {
  const p = recoveryPlan(beachHouse({ labourProjected: 36000 + 1508 }))!
  assert.equal(p.onTrack, true)
  near(p.gap, 36000 - 0.39 * 96336) // -1571.04
  assert.equal(p.wagesToCut, null)
  assert.equal(p.extraTakings, null)
  assert.equal(p.extraTakingsPct, null)
  assert.equal(p.wagesOutOfReach, false)
})

test("a gap bigger than the whole roster left is out of reach on wages alone; a department likewise", () => {
  const p = recoveryPlan(beachHouse({ labourProjected: 45000 + 1508, rosterStillToRun: 1000, buckets: [bucket({ key: "chefsKp", label: "Chefs + KP", target: { key: "chefsKp", label: "Chefs + KP", min: 12.5, max: 13.5 }, projectedTotal: 0.16 * 96336, workingPct: 16, rosterStillToRun: 500 })] }))!
  assert.equal(p.onTrack, false)
  assert.equal(p.wagesOutOfReach, true)
  assert.equal(p.depts[0].outOfReach, true)
})

test("Wednesday: nothing finished yet, so no 'done' line; the whole week is the rest", () => {
  const p = recoveryPlan(beachHouse({ locked: { labour: 0, revenue: 0, pct: null, days: 0, paidLeave: 0, workingPct: null } }))!
  assert.equal(p.soFar, null)
  assert.equal(p.rest.days, 7)
  near(p.rest.wages, 37626)
})

test("no takings projected at all: no plan rather than a divide by zero", () => {
  assert.equal(recoveryPlan(beachHouse({ revenueProjected: 0 })), null)
})

test("departments over their top come worst dollars first", () => {
  const p = recoveryPlan(beachHouse({
    buckets: [
      bucket({ key: "pastry", label: "Pastry", target: { key: "pastry", label: "Pastry", min: 2.5, max: 3 }, projectedTotal: 0.035 * 96336, workingPct: 3.5 }),
      bucket({ key: "chefsKp", label: "Chefs + KP", target: { key: "chefsKp", label: "Chefs + KP", min: 12.5, max: 13.5 }, projectedTotal: 0.145 * 96336, workingPct: 14.5 }),
    ],
  }))!
  assert.deepEqual(p.depts.map((d) => d.label), ["Chefs + KP", "Pastry"])
})

// The engine side: what counts as "still rostered to run".
test("roster still to run: not-started shifts and the rest of shifts underway, never salaries or clocked hours", () => {
  // Sunday 22 Nov 2026, 10:00 am Brisbane. Week Wed 18 to Tue 24.
  const now = new Date("2026-11-22T00:00:00Z")
  const at = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - 10 * 3600_000)
  const shift = (source: string, area: string, date: string, from: string, to: string, cost: number): LiveLabourRows["labourShifts"][number] => ({ venue: "BURLEIGH", area, cost, source, shiftStart: at(date, from), shiftEnd: at(date, to) })
  const rows: LiveLabourRows = {
    labourShifts: [
      shift("TIMESHEET", "Kitchen", "2026-11-22", "06:00", "14:00", 300), // clocked, not trimmable
      shift("ROSTER", "Kitchen", "2026-11-22", "06:00", "14:00", 400), // underway: 4 of 8 hours left = 200
      shift("ROSTER", "FOH", "2026-11-23", "07:00", "15:00", 500), // tomorrow, not started
      shift("ROSTER", "Salary BOH BURLEIGH", "2026-11-23", "00:00", "01:00", 250), // salary
    ],
    pos: [{ date: "2026-11-18", venue: "BURLEIGH", exGst: 5000, source: "EMAIL" }],
    uber: [],
    events: [],
    forecasts: [],
    labourMultiplier: 1,
  }
  const v = buildLiveLabourSnapshot(rows, now).venues.find((x) => x.venue === "BURLEIGH")!
  near(v.rosterStillToRun, 700)
  near(v.buckets.find((b) => b.key === "chefsKp")!.rosterStillToRun, 200)
  near(v.buckets.find((b) => b.key === "fohBarista")!.rosterStillToRun, 500)
  assert.ok(v.revenueStillToCome > 0)
})
