import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { recoveryPlan, type RecoveryPlan } from "./recovery"
import { buildLiveLabourSnapshot, type LiveLabourRows, type LiveVenueSnapshot, type LiveBucketRow } from "./live"

/**
 * cutToFix (Chloe, 23 Nov 2026: "I think you're wrong about the only $55").
 * Teams are held to their own band, so the cut asked for is every team's
 * overspend added up, never netted, or the week gap when that is bigger.
 * The proof that matters: make the cut and re-run the plan, and the week is
 * on target with no team over its top.
 */

const near = (a: number | null | undefined, b: number, msg?: string) => assert.ok(a != null && Math.abs(a - b) < 0.011, `${msg ?? ""} got ${a}, want ${b}`)
const r2 = (n: number) => Math.round(n * 100) / 100

const R = 96336 // Beach House takings for the week, ex GST

type Key = "chefsKp" | "fohBarista" | "pastry"
const BANDS: Record<Key, { label: string; min: number; max: number }> = {
  chefsKp: { label: "Chefs + KP", min: 12.5, max: 13.5 },
  fohBarista: { label: "FOH (incl. Barista)", min: 21.5, max: 22.5 },
  pastry: { label: "Pastry", min: 2.5, max: 3 },
}

/** A Beach House department at a % of the week's takings, paid leave optional (it sits inside projectedTotal). */
function team(key: Key, pctOfTakings: number, stillToRun: number, paidLeave = 0): LiveBucketRow {
  const b = BANDS[key]
  const working = (pctOfTakings / 100) * R
  return {
    key,
    label: b.label,
    target: { key, label: b.label, min: b.min, max: b.max },
    spentToDate: 0,
    projectedTotal: working + paidLeave,
    projectedPct: null,
    status: "no-target",
    varianceVsBandPct: null,
    paidLeave,
    workingPct: pctOfTakings,
    workingStatus: "no-target",
    workingVarianceVsBandPct: null,
    rosterStillToRun: stillToRun,
  }
}

/** Beach House, Mon 23 Nov 2026 evening. Week wages are the teams plus any wages outside a band (office, admin), plus paid leave. */
function beachHouse(buckets: LiveBucketRow[], outsideBands = 0, over: Partial<LiveVenueSnapshot> = {}): LiveVenueSnapshot {
  const paidLeave = 1508 + buckets.reduce((s, b) => s + b.paidLeave, 0)
  const working = buckets.reduce((s, b) => s + (b.projectedTotal - b.paidLeave), 0) + outsideBands
  return {
    venue: "BEACH_HOUSE",
    label: "Tarte Beach House (Currumbin)",
    labourToDate: 0,
    labourProjected: working + paidLeave,
    revenueToDate: 86764,
    revenueProjected: R,
    revenueLastWeekSameDays: null,
    revenueVsLastWeekPct: null,
    revenueLastWeekTotal: null,
    overallProjectedPct: null,
    paidLeave,
    workingProjectedPct: (working / R) * 100,
    locked: { labour: 28913 + 1293, revenue: 75684, pct: null, days: 5, paidLeave: 1293, workingPct: (28913 / 75684) * 100 },
    today: { live: true, labourSoFar: 4521, revenueSoFar: 10726, shareOfDayDone: 1, revenueRestOfDay: 0, labourRestOfDay: 0 },
    rosterStillToRun: buckets.reduce((s, b) => s + b.rosterStillToRun, 0) + 300,
    revenueStillToCome: 9572,
    days: [],
    buckets,
    coverage: { daysLocked: 5, daysRemaining: 1, asOf: "2026-11-23T09:59:00.000Z" },
    ...over,
  }
}

/**
 * Make the cut the plan asks for: each team over loses exactly its overspend,
 * then whatever the week still needs (cutToFix less teamsOver) comes off
 * `extraFrom` (a team, or wages outside the bands when null).
 */
function applyCut(v: LiveVenueSnapshot, p: RecoveryPlan, extraFrom: Key | null): LiveVenueSnapshot {
  const extra = (p.cutToFix ?? 0) - p.teamsOver
  const buckets = v.buckets.map((b) => {
    const d = p.depts.find((x) => x.label === b.label)
    let total = b.projectedTotal - (d ? d.over : 0)
    if (extraFrom && b.key === extraFrom) total -= extra
    return { ...b, projectedTotal: total }
  })
  return { ...v, buckets, labourProjected: v.labourProjected - (p.cutToFix ?? 0) }
}

function assertFixed(after: RecoveryPlan | null, msg: string) {
  assert.ok(after, msg)
  assert.ok(after.gap <= 0.01, `${msg}: week still ${after.gap} over after the cut`)
  assert.deepEqual(after.depts.map((d) => d.label), [], `${msg}: a team is still over its top after the cut`)
  assert.equal(after.cutToFix, null, `${msg}: still asks for a cut after the cut`)
}

describe("cutToFix lands the week on target AND every team inside its band", () => {
  // Teams x wages outside the bands. Covers: teams over and the week over,
  // teams over and the week under, no team over and the week over, and the
  // gap exactly equal to the teams over.
  const scenarios: [string, LiveBucketRow[], number][] = [
    ["Chloe's screenshot: Chefs + KP 14.5%, FOH 21% under its band", [team("chefsKp", 14.5, 1400), team("fohBarista", 21, 2400)], 37626 - 0.355 * R],
    ["two teams over, one under", [team("chefsKp", 14.5, 1400), team("fohBarista", 18, 2400), team("pastry", 3.5, 600)], 1200],
    ["every team over and the week further over still (office wages)", [team("chefsKp", 14, 1400), team("fohBarista", 23, 2400), team("pastry", 3.2, 600)], 2500],
    ["teams over, week under (FOH and Pastry well under)", [team("chefsKp", 14.5, 1400), team("fohBarista", 19, 2400), team("pastry", 2, 600)], 0],
    ["no team over, week over on office wages alone", [team("chefsKp", 13, 1400), team("fohBarista", 22, 2400), team("pastry", 2.8, 600)], 2400],
    ["gap exactly equals the teams over", [team("chefsKp", 14.5, 1400), team("fohBarista", 22.5, 2400), team("pastry", 3, 600)], 0],
    ["a team over with its paid leave inside the total (leave never counts)", [team("chefsKp", 13.9, 1400, 2200), team("fohBarista", 22, 2400)], 600],
  ]

  for (const [name, buckets, outside] of scenarios) {
    test(name, () => {
      const v = beachHouse(buckets, outside)
      const p = recoveryPlan(v)!
      // teamsOver is the plain sum of the teams listed, to the cent, never netted.
      assert.equal(p.teamsOver, r2(p.depts.reduce((s, d) => s + d.over, 0)))
      for (const d of p.depts) assert.ok(d.over > 0)
      // cutToFix is max(teamsOver, gap), or null when neither is positive.
      const want = Math.max(p.teamsOver, p.gap)
      if (want > 0) near(p.cutToFix, want)
      else assert.equal(p.cutToFix, null)
      assert.ok((p.cutToFix ?? 0) >= p.teamsOver && (p.cutToFix ?? 0) >= p.gap - 0.005)

      // Make the cut with the extra taken from wages outside the bands, then from FOH, then from Pastry.
      for (const extraFrom of [null, "fohBarista", "pastry"] as const) {
        if (extraFrom && !v.buckets.some((b) => b.key === extraFrom)) continue
        const after = recoveryPlan(applyCut(v, p, extraFrom))
        assertFixed(after, `${name}, extra from ${extraFrom ?? "outside the bands"}`)
        // When the week gap was the bigger number, the cut lands the week on target to the cent, not under it.
        if (p.gap > p.teamsOver) near(after!.gap, 0, "on target to the cent")
      }
    })
  }

  test("it is the least that works: a dollar less on the worst team leaves that team over", () => {
    const v = beachHouse([team("chefsKp", 14.5, 1400), team("fohBarista", 18, 2400), team("pastry", 3.5, 600)], 0)
    const p = recoveryPlan(v)!
    const short = applyCut(v, { ...p, depts: p.depts.map((d, i) => (i === 0 ? { ...d, over: d.over - 1 } : d)), teamsOver: p.teamsOver - 1, cutToFix: p.cutToFix! - 1 }, null)
    const after = recoveryPlan(short)!
    assert.deepEqual(after.depts.map((d) => d.label), ["Chefs + KP"])
    near(after.depts[0].over, 1)
  })

  test("a team under its band never offsets one over: moving FOH further under does not shrink the cut", () => {
    const a = recoveryPlan(beachHouse([team("chefsKp", 14.5, 1400), team("fohBarista", 22, 2400)], 0))!
    const b = recoveryPlan(beachHouse([team("chefsKp", 14.5, 1400), team("fohBarista", 15, 2400)], 0))!
    near(a.teamsOver, 0.01 * R)
    near(b.teamsOver, 0.01 * R)
    near(b.cutToFix, 0.01 * R)
    assert.equal(b.onTrack, true, "the week is well under once FOH drops")
  })
})

describe("cutToFix sits beside the old fields, it does not replace them", () => {
  test("Chloe's screenshot: the week ask is still $55 (wagesToCut, extraTakings), the team ask is $963", () => {
    const p = recoveryPlan(beachHouse([team("chefsKp", 14.5, 1400), team("fohBarista", 21, 2400)], 37626 - 0.355 * R))!
    near(p.gap, 37626 - 0.39 * R) // 54.96
    near(p.wagesToCut, 54.96)
    near(p.extraTakings, 54.96 / 0.39)
    assert.equal(p.wagesOutOfReach, false)
    near(p.teamsOver, 963.36)
    near(p.cutToFix, 963.36)
    // What the page lists under the cut: Chefs + KP, and no "plus from any team" line as the teams cover the week.
    assert.deepEqual(p.depts.map((d) => d.label), ["Chefs + KP"])
    assert.ok(!(p.gap > p.teamsOver))
  })

  test("teams over but week under: still on track for the week, no wagesToCut, but a cut for the team", () => {
    const p = recoveryPlan(beachHouse([team("chefsKp", 14.5, 1400), team("fohBarista", 19, 2400)], 0))!
    assert.equal(p.onTrack, true)
    assert.equal(p.wagesToCut, null)
    assert.equal(p.extraTakings, null)
    near(p.cutToFix, 963.36)
  })

  test("no team over but week over: the cut is the week gap, same as wagesToCut", () => {
    const p = recoveryPlan(beachHouse([team("chefsKp", 13, 1400), team("fohBarista", 22, 2400)], 5000))!
    assert.equal(p.onTrack, false)
    assert.equal(p.teamsOver, 0)
    assert.deepEqual(p.depts, [])
    near(p.cutToFix, p.gap)
    near(p.cutToFix, p.wagesToCut!)
  })

  test("one cent over on the week and no team over: a one cent cut, not null", () => {
    const p = recoveryPlan(beachHouse([], 0.39 * R + 0.01))!
    near(p.gap, 0.01)
    near(p.cutToFix, 0.01)
  })

  test("exactly on target with every team at its top: no cut", () => {
    const p = recoveryPlan(beachHouse([team("chefsKp", 13.5, 1400), team("fohBarista", 22.5, 2400), team("pastry", 3, 600)], 0))!
    near(p.gap, 0)
    assert.equal(p.teamsOver, 0)
    assert.equal(p.cutToFix, null)
  })

  test("a team with no band, or no working %, is not counted as a team over (it still counts in the week gap)", () => {
    const office: LiveBucketRow = { ...team("chefsKp", 30, 0), key: "other", label: "Other", target: null, workingPct: 30 }
    const noPct: LiveBucketRow = { ...team("pastry", 4, 0), workingPct: null }
    const p = recoveryPlan(beachHouse([team("chefsKp", 13, 1400), office, noPct], 0))!
    assert.equal(p.onTrack, false)
    assert.equal(p.teamsOver, 0)
    near(p.cutToFix, p.gap)
  })

  test("a credit week for a team (negative projected) is not over and does not reduce another team's overspend", () => {
    const credit: LiveBucketRow = { ...team("pastry", 0, 0), projectedTotal: -400, workingPct: -0.4 }
    const p = recoveryPlan(beachHouse([team("chefsKp", 14.5, 1400), credit], 0))!
    near(p.teamsOver, 963.36)
    near(p.cutToFix, 963.36)
  })
})

describe("cutToFix at the ends of the week, from the engine", () => {
  /** An instant from a Brisbane date and clock time. */
  const at = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - 10 * 3600_000)
  type Shift = LiveLabourRows["labourShifts"][number]
  const shift = (source: "ROSTER" | "TIMESHEET", area: string, date: string, from: string, to: string, cost: number): Shift => ({
    venue: "BEACH_HOUSE",
    area,
    cost,
    source,
    shiftStart: at(date, from),
    shiftEnd: at(date, to),
  })
  const dayAfter = (date: string, n: number) => {
    const d = new Date(`${date}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().split("T")[0]
  }
  const MULT = 1.12
  const week = Array.from({ length: 7 }, (_, i) => dayAfter("2026-11-18", i))
  const history = Array.from({ length: 28 }, (_, i) => ({ date: dayAfter("2026-11-18", -(i + 1)), venue: "BEACH_HOUSE" as const, exGst: 13000, source: "EMAIL" as const }))

  test("Tuesday 9:30 pm, all shifts done: Chefs + KP over with nothing left to cut, FOH under does not net it, the ask is the team total", () => {
    // Chefs + KP $2,000 a day, FOH $2,600 a day, Pastry $300 a day, before on-costs, on $13,000 a day.
    const rows: LiveLabourRows = {
      labourShifts: week.flatMap((d) => [
        shift("TIMESHEET", "Restaurant Kitchen", d, "06:00", "15:00", 2000),
        shift("ROSTER", "Restaurant Kitchen", d, "06:00", "15:00", 2000),
        shift("TIMESHEET", "Cafe FOH", d, "07:00", "15:00", 2600),
        shift("ROSTER", "Cafe FOH", d, "07:00", "15:00", 2600),
        shift("TIMESHEET", "Pastry", d, "05:00", "09:00", 300),
        shift("ROSTER", "Pastry", d, "05:00", "09:00", 300),
      ]),
      pos: [...history, ...week.map((date) => ({ date, venue: "BEACH_HOUSE" as const, exGst: 13000, source: "EMAIL" as const }))],
      uber: [],
      events: [],
      forecasts: [],
      labourMultiplier: MULT,
    }
    const v = buildLiveLabourSnapshot(rows, at("2026-11-24", "21:30")).venues.find((x) => x.venue === "BEACH_HOUSE")!
    assert.equal(v.rosterStillToRun, 0)
    assert.equal(v.revenueStillToCome, 0)
    const p = recoveryPlan(v)!
    const takings = 7 * 13000
    const chefs = 7 * 2000 * MULT // 15,680 = 17.2%
    const foh = 7 * 2600 * MULT // 20,384 = 22.4%, inside 22.5
    const pastry = 7 * 300 * MULT // 2,352 = 2.6%, inside 3
    near(p.gap, chefs + foh + pastry - 0.39 * takings) // 38,416 - 35,490 = 2,926
    assert.deepEqual(p.depts.map((d) => d.label), ["Chefs + KP"])
    near(p.teamsOver, chefs - 0.135 * takings) // 15,680 - 12,285 = 3,395
    near(p.cutToFix, chefs - 0.135 * takings)
    assert.ok(p.teamsOver > p.gap, "the teams ask is bigger than the netted week")
    assert.equal(p.depts[0].stillToRun, 0)
    assert.equal(p.depts[0].outOfReach, true)
    assert.equal(p.extraTakingsPct, null)
  })

  test("Wednesday 6 am, no days done: a team over on the roster alone is still asked for in full", () => {
    const rows: LiveLabourRows = {
      labourShifts: [
        ...week.map((d) => shift("ROSTER", "Restaurant Kitchen", d, "06:00", "15:00", 2000)),
        ...week.map((d) => shift("ROSTER", "Cafe FOH", d, "07:00", "15:00", 2000)),
      ],
      pos: history,
      uber: [],
      events: [],
      forecasts: [],
      labourMultiplier: MULT,
    }
    const v = buildLiveLabourSnapshot(rows, at("2026-11-18", "06:00")).venues.find((x) => x.venue === "BEACH_HOUSE")!
    assert.equal(v.locked.days, 0)
    const p = recoveryPlan(v)!
    assert.equal(p.soFar, null)
    const takings = v.revenueProjected
    near(p.teamsOver, 7 * 2000 * MULT - 0.135 * takings)
    assert.ok(p.onTrack, "FOH well under keeps the week under 39%")
    near(p.cutToFix, p.teamsOver)
    assert.equal(p.depts[0].outOfReach, false)
  })
})
