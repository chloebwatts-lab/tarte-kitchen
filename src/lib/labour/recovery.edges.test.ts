import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { recoveryPlan } from "./recovery"
import { buildLiveLabourSnapshot, type LiveLabourRows, type LiveVenueSnapshot, type LiveBucketRow } from "./live"

/**
 * Edges for "To finish the week on target" (Chloe, 23 Nov 2026): the maths
 * closes the gap exactly, roster still to run never holds salaries or
 * clocked hours, and the ends of the week (Wednesday morning, Tuesday
 * night, AEST midnight) behave.
 */

const near = (a: number | null | undefined, b: number, msg?: string) => assert.ok(a != null && Math.abs(a - b) < 0.011, `${msg ?? ""} got ${a}, want ${b}`)
const MULT = 1.12

/** An instant from a Brisbane date and clock time. */
const at = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - 10 * 3600_000)
type Shift = LiveLabourRows["labourShifts"][number]
const shift = (venue: Shift["venue"], source: "ROSTER" | "TIMESHEET", area: string | null, date: string, from: string, to: string, cost: number, leave?: boolean): Shift => ({
  venue,
  area,
  cost,
  source,
  shiftStart: at(date, from),
  shiftEnd: at(date, to),
  ...(leave ? { leave } : {}),
})
const dayAfter = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split("T")[0]
}
/** Four earlier weeks of tills at a flat amount a day, so every weekday median is that amount. */
const history = (venue: Shift["venue"], weekStart: string, perDay: number): LiveLabourRows["pos"] =>
  Array.from({ length: 28 }, (_, i) => ({ date: dayAfter(weekStart, -(i + 1)), venue, exGst: perDay, source: "EMAIL" as const }))

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

/** Burleigh on a Sunday afternoon: Wed to Sat done, a head chef away all week on paid leave. */
function burleigh(over: Partial<LiveVenueSnapshot> = {}): LiveVenueSnapshot {
  return {
    venue: "BURLEIGH",
    label: "Tarte Burleigh",
    labourToDate: 0,
    labourProjected: 24000,
    revenueToDate: 40000,
    revenueProjected: 58000,
    revenueLastWeekSameDays: null,
    revenueVsLastWeekPct: null,
    revenueLastWeekTotal: null,
    overallProjectedPct: null,
    paidLeave: 2000,
    workingProjectedPct: (22000 / 58000) * 100,
    locked: { labour: 14500, revenue: 33000, pct: null, days: 4, paidLeave: 1150, workingPct: null },
    today: { live: true, labourSoFar: 1800, revenueSoFar: 7000, shareOfDayDone: 0.8, revenueRestOfDay: 1500, labourRestOfDay: 700 },
    rosterStillToRun: 3100,
    revenueStillToCome: 18000,
    days: [],
    buckets: [
      // Chefs + KP: $8,900 on the week with the $2,000 leave inside it. $6,900 working is 11.9%, under the 12% top.
      bucket({ key: "chefsKp", label: "Chefs + KP", target: { key: "chefsKp", label: "Chefs + KP", min: 11.5, max: 12 }, projectedTotal: 8900, paidLeave: 2000, workingPct: (6900 / 58000) * 100, rosterStillToRun: 1200 }),
      // FOH + Barista: $12,600 is 21.7%, over the 21% top by $420.
      bucket({ key: "fohBarista", label: "FOH + Barista", target: { key: "fohBarista", label: "FOH + Barista", min: 20.5, max: 21 }, projectedTotal: 12600, workingPct: (12600 / 58000) * 100, rosterStillToRun: 1500 }),
      bucket({ key: "pastry", label: "Pastry", target: { key: "pastry", label: "Pastry", min: 4.75, max: 5.25 }, projectedTotal: 2500, workingPct: (2500 / 58000) * 100, rosterStillToRun: 400 }),
    ],
    coverage: { daysLocked: 4, daysRemaining: 2, asOf: "2026-11-22T05:00:00.000Z" },
    ...over,
  }
}

describe("recovery maths: either fix lands the week exactly on target", () => {
  test("Burleigh 38.25%, paid leave out: gap, the cut and the extra takings all close it", () => {
    const v = burleigh()
    const p = recoveryPlan(v)!
    assert.equal(p.targetPct, 38.25)
    const weekWages = 24000 - 2000
    near(p.gap, weekWages - 0.3825 * 58000) // 22000 - 22185 = -185: on track
    assert.equal(p.onTrack, true)
    near(p.week.pct, (22000 / 58000) * 100)

    // Push it over: $1,000 more wages.
    const over = recoveryPlan(burleigh({ labourProjected: 25000 }))!
    near(over.gap, 23000 - 0.3825 * 58000) // 815
    assert.equal(over.onTrack, false)
    // Cutting wagesToCut lands on 38.25%.
    near(((23000 - over.wagesToCut!) / 58000) * 100, 38.25, "after the cut")
    // Taking extraTakings more lands on 38.25% too.
    near((23000 / (58000 + over.extraTakings!)) * 100, 38.25, "after the extra takings")
    near(over.extraTakings, 815 / 0.3825)
    near(over.extraTakingsPct, (815 / 0.3825 / 18000) * 100)
  })

  test("the done days and the rest add up to the week: gap = rest wages less the most the rest can cost", () => {
    for (const labourProjected of [20000, 24000, 25000, 30000]) {
      const p = recoveryPlan(burleigh({ labourProjected }))!
      near(p.gap, p.rest.wages - p.rest.maxWagesForTarget, `at ${labourProjected}`)
      near(p.soFar!.wages + p.rest.wages, p.week.wages)
      near(p.soFar!.revenue + p.rest.revenue, p.week.revenue)
      // Locked wages are paid leave out as well: 14,500 less 1,150.
      near(p.soFar!.wages, 13350)
      near(p.soFar!.overTarget, 13350 - 0.3825 * 33000)
    }
  })

  test("a department is judged with its paid leave out: Chefs is not listed, FOH is $420 over", () => {
    const p = recoveryPlan(burleigh())!
    // With the $2,000 leave left in, Chefs would read $1,940 over 12%. It must not.
    assert.deepEqual(p.depts.map((d) => d.label), ["FOH + Barista"])
    near(p.depts[0].over, 12600 - 0.21 * 58000)
    near(p.depts[0].stillToRun, 1500)
    assert.equal(p.depts[0].outOfReach, false)
  })

  test("exactly on target is on track; one cent over is not", () => {
    const onTheLine = recoveryPlan(burleigh({ labourProjected: 2000 + 0.3825 * 58000 }))!
    near(onTheLine.gap, 0)
    assert.equal(onTheLine.onTrack, true)
    assert.equal(onTheLine.wagesToCut, null)
    assert.equal(onTheLine.extraTakings, null)

    const cent = recoveryPlan(burleigh({ labourProjected: 2000 + 0.3825 * 58000 + 0.01 }))!
    assert.equal(cent.onTrack, false)
    near(cent.wagesToCut, 0.01)
  })

  test("the done days already past target: the rest has no room at all", () => {
    // Wed to Sat cost $14,000 working on $33,000 (42.4%); the week at 38.25% of $36,000 only allows $13,770.
    const p = recoveryPlan(burleigh({ revenueProjected: 36000, labourProjected: 2000 + 16000, locked: { labour: 15150, revenue: 33000, pct: null, days: 4, paidLeave: 1150, workingPct: null } }))!
    assert.ok(p.rest.maxWagesForTarget < 0, `maxWagesForTarget ${p.rest.maxWagesForTarget}`)
    near(p.rest.maxWagesForTarget, 0.3825 * 36000 - 14000)
    assert.equal(p.onTrack, false)
  })

  test("target override: none, zero or negative gives no plan", () => {
    assert.equal(recoveryPlan(burleigh(), null), null)
    assert.equal(recoveryPlan(burleigh(), 0), null)
    assert.equal(recoveryPlan(burleigh(), -5), null)
    assert.equal(recoveryPlan(burleigh(), 40)!.targetPct, 40)
  })

  test("negative takings on the done days (refunds over sales): no % for them, nothing breaks", () => {
    const p = recoveryPlan(burleigh({ locked: { labour: 14500, revenue: -250, pct: null, days: 4, paidLeave: 1150, workingPct: null } }))!
    assert.equal(p.soFar!.pct, null)
    near(p.soFar!.overTarget, 13350 + 0.3825 * 250)
    near(p.rest.revenue, 58000 + 250)
    for (const n of [p.gap, p.rest.wages, p.rest.revenue, p.rest.maxWagesForTarget, p.stillToRun]) assert.ok(Number.isFinite(n))
  })

  test("negative projected takings for the week gives no plan", () => {
    assert.equal(recoveryPlan(burleigh({ revenueProjected: -100 })), null)
  })

  test("a negative roster still to run (a credit row) counts as nothing left to cut", () => {
    const p = recoveryPlan(burleigh({
      labourProjected: 25000,
      rosterStillToRun: -60,
      buckets: [bucket({ key: "fohBarista", label: "FOH + Barista", target: { key: "fohBarista", label: "FOH + Barista", min: 20.5, max: 21 }, projectedTotal: 12600, workingPct: 21.7, rosterStillToRun: -60 })],
    }))!
    assert.equal(p.stillToRun, 0)
    assert.equal(p.wagesOutOfReach, true)
    assert.equal(p.depts[0].stillToRun, 0)
    assert.equal(p.depts[0].outOfReach, true)
  })
})

describe("roster still to run, from the engine", () => {
  test("Beach House mid Sunday: equals the projection less clocked hours and salaries, nothing twice", () => {
    // Sun 22 Nov 2026, 1:00 pm Brisbane. Week Wed 18 to Tue 24.
    const now = at("2026-11-22", "13:00")
    const BH = "BEACH_HOUSE" as const
    const labourShifts: Shift[] = [
      shift(BH, "TIMESHEET", "Restaurant Kitchen", "2026-11-21", "06:00", "15:00", 330), // Saturday, clocked
      shift(BH, "ROSTER", "Restaurant Kitchen", "2026-11-21", "06:00", "15:00", 330), // Saturday roster, finished: not trimmable
      shift(BH, "TIMESHEET", "Cafe Kitchen", "2026-11-22", "06:00", "13:00", 245), // today, clocked so far
      shift(BH, "ROSTER", "Cafe Kitchen", "2026-11-22", "06:00", "13:00", 245), // finished on the dot: nothing left
      shift(BH, "ROSTER", "Cafe FOH", "2026-11-22", "09:00", "17:00", 264), // underway: 4 of 8 hours left = 132
      shift(BH, "ROSTER", "Pastry", "2026-11-22", "14:00", "18:00", 140), // later today, not started
      shift(BH, "ROSTER", "Restaurant Bar", "2026-11-24", "16:00", "22:00", 198), // Tuesday
      shift(BH, "ROSTER", "Office", "2026-11-23", "09:00", "13:00", 120), // no department ("other"): trimmable, in the venue figure only
      shift(BH, "ROSTER", "Salary Chef Currumbin", "2026-11-23", "00:00", "01:00", 420), // salary
      shift(BH, "ROSTER", "Salary Currumbin FOH", "2026-11-24", "00:00", "01:00", 380, true), // salary on paid leave
      shift("BURLEIGH", "ROSTER", "Kitchen", "2026-11-23", "06:00", "14:00", 999), // the other venue
    ]
    const rows: LiveLabourRows = {
      labourShifts,
      pos: [...history(BH, "2026-11-18", 13000), ...["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"].map((date) => ({ date, venue: BH, exGst: 13000, source: "EMAIL" as const }))],
      uber: [],
      events: [],
      forecasts: [],
      labourMultiplier: MULT,
    }
    const v = buildLiveLabourSnapshot(rows, now).venues.find((x) => x.venue === BH)!
    near(v.rosterStillToRun, (132 + 140 + 198 + 120) * MULT)
    near(v.buckets.find((b) => b.key === "chefsKp")!.rosterStillToRun, 0)
    near(v.buckets.find((b) => b.key === "fohBarista")!.rosterStillToRun, (132 + 198) * MULT)
    near(v.buckets.find((b) => b.key === "pastry")!.rosterStillToRun, 140 * MULT)
    // The invariant: roster still to run is the projection less clocked hours and salaries.
    near(v.rosterStillToRun, v.labourProjected - v.labourToDate - (420 + 380) * MULT, "projection less clocked and salaries")
    // Takings still to come is the projection less takings in.
    near(v.revenueStillToCome, v.revenueProjected - v.revenueToDate)
    // Today has no till yet: the whole Sunday plus Mon and Tue are still to come.
    near(v.revenueStillToCome, 3 * 13000)
  })

  test("Tuesday night after close: nothing left rostered or to take, so an overrun is out of reach on wages", () => {
    // Tue 24 Nov 2026, 9:30 pm Brisbane. Every shift is done and Tuesday's final till figure is in.
    const now = at("2026-11-24", "21:30")
    const BH = "BEACH_HOUSE" as const
    const week = Array.from({ length: 7 }, (_, i) => dayAfter("2026-11-18", i))
    const rows: LiveLabourRows = {
      labourShifts: week.flatMap((d) => [
        shift(BH, "TIMESHEET", "Restaurant Kitchen", d, "06:00", "15:00", 4400),
        shift(BH, "ROSTER", "Restaurant Kitchen", d, "06:00", "15:00", 4400),
        shift(BH, "ROSTER", "Salary Chef Currumbin", d, "00:00", "01:00", 300),
      ]),
      pos: [...history(BH, "2026-11-18", 13000), ...week.map((date) => ({ date, venue: BH, exGst: 13000, source: "EMAIL" as const }))],
      uber: [],
      events: [],
      forecasts: [],
      labourMultiplier: MULT,
    }
    const v = buildLiveLabourSnapshot(rows, now).venues.find((x) => x.venue === BH)!
    assert.equal(v.locked.days, 6)
    assert.equal(v.rosterStillToRun, 0)
    assert.equal(v.revenueStillToCome, 0)
    const p = recoveryPlan(v)!
    near(p.gap, 7 * 4700 * MULT - 0.39 * 7 * 13000) // 36,848 - 35,490 = 1,358
    assert.equal(p.onTrack, false)
    near(p.wagesToCut, p.gap)
    assert.equal(p.stillToRun, 0)
    assert.equal(p.wagesOutOfReach, true)
    // Nothing forecast left, so no "% above the forecast" figure (no divide by zero).
    assert.equal(p.extraTakingsPct, null)
    assert.equal(p.rest.days, 1)
  })

  test("Wednesday 6 am: a new week, no done days, the whole roster is still to run", () => {
    // Wed 25 Nov 2026, 6:00 am Brisbane = Tue 24 Nov, 8:00 pm UTC.
    const now = at("2026-11-25", "06:00")
    assert.equal(now.toISOString(), "2026-11-24T20:00:00.000Z")
    const B = "BURLEIGH" as const
    const rows: LiveLabourRows = {
      labourShifts: [
        shift(B, "TIMESHEET", "Kitchen", "2026-11-25", "05:00", "06:00", 40), // clocked so far
        shift(B, "ROSTER", "Kitchen", "2026-11-25", "05:00", "13:00", 320), // underway: 7 of 8 hours left = 280
        shift(B, "ROSTER", "KP", "2026-11-25", "07:00", "15:00", 400), // not started
        shift(B, "ROSTER", "FOH", "2026-11-26", "07:00", "15:00", 360), // Thursday
        shift(B, "ROSTER", "Salary BOH BURLEIGH", "2026-11-25", "00:00", "01:00", 250),
      ],
      pos: history(B, "2026-11-25", 5000),
      uber: [],
      events: [],
      forecasts: [],
      labourMultiplier: MULT,
    }
    const v = buildLiveLabourSnapshot(rows, now).venues.find((x) => x.venue === B)!
    assert.equal(v.locked.days, 0)
    near(v.rosterStillToRun, (280 + 400 + 360) * MULT)
    near(v.buckets.find((b) => b.key === "chefsKp")!.rosterStillToRun, (280 + 400) * MULT)
    near(v.revenueStillToCome, 7 * 5000)
    const p = recoveryPlan(v)!
    assert.equal(p.soFar, null)
    assert.equal(p.rest.days, 7)
    near(p.rest.wages, p.week.wages)
    near(p.rest.maxWagesForTarget, 0.3825 * 35000)
  })

  test("Wednesday with no history, no forecast and no takings yet: no plan rather than a divide by zero", () => {
    const now = at("2026-11-25", "06:00")
    const rows: LiveLabourRows = {
      labourShifts: [shift("BURLEIGH", "ROSTER", "KP", "2026-11-25", "07:00", "15:00", 400)],
      pos: [],
      uber: [],
      events: [],
      forecasts: [],
      labourMultiplier: MULT,
    }
    const v = buildLiveLabourSnapshot(rows, now).venues.find((x) => x.venue === "BURLEIGH")!
    assert.equal(v.revenueProjected, 0)
    assert.equal(v.revenueStillToCome, 0)
    assert.equal(recoveryPlan(v), null)
  })

  test("the week turns over at AEST midnight, not UTC midnight", () => {
    const rows: LiveLabourRows = { labourShifts: [], pos: history("BURLEIGH", "2026-11-25", 5000), uber: [], events: [], forecasts: [], labourMultiplier: MULT }
    // Tue 11:59 pm Brisbane: still last week, six days done.
    const tueNight = buildLiveLabourSnapshot(rows, new Date("2026-11-24T13:59:00Z"))
    assert.equal(tueNight.weekStart, "2026-11-18")
    assert.equal(tueNight.venues.find((x) => x.venue === "BURLEIGH")!.locked.days, 6)
    // Wed 12:00 am Brisbane (2 pm UTC Tuesday): the new week, nothing done.
    const wedMidnight = buildLiveLabourSnapshot(rows, new Date("2026-11-24T14:00:00Z"))
    assert.equal(wedMidnight.weekStart, "2026-11-25")
    const v = wedMidnight.venues.find((x) => x.venue === "BURLEIGH")!
    assert.equal(v.locked.days, 0)
    assert.equal(recoveryPlan(v)!.soFar, null)
  })
})
