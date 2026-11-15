import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { aestDateKey, buildLiveLabourSnapshot, shareOfDayDone, type LiveLabourRows } from "./live"

/**
 * Edges around the live wage snapshot (pre-push guard, 15 Nov 2026):
 * Brisbane midnight against UTC, TIMESHEET and ROSTER never counted twice,
 * venues kept apart, the forecast fallbacks, and nothing dividing by zero.
 * Trading week Wed 11 to Tue 17 Nov 2026.
 */
const MULT = 1.12
const WEEK = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]

/** An instant from a Brisbane date and clock time. */
const at = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - 10 * 3600_000)

type Shift = LiveLabourRows["labourShifts"][number]
type V = Shift["venue"]
const sheet = (date: string, from: string, to: string, cost: number, venue: V = "BURLEIGH", area = "Kitchen"): Shift => ({ venue, area, cost, source: "TIMESHEET", shiftStart: at(date, from), shiftEnd: at(date, to) })
const roster = (date: string, from: string, to: string, cost: number, venue: V = "BURLEIGH", area = "Kitchen"): Shift => ({ venue, area, cost, source: "ROSTER", shiftStart: at(date, from), shiftEnd: at(date, to) })
const salary = (date: string, cost: number, venue: V = "BURLEIGH", area = "Salary BOH BURLEIGH"): Shift => ({ venue, area, cost, source: "ROSTER", shiftStart: at(date, "00:00"), shiftEnd: at(date, "01:00") })

/** `weeks` earlier weeks of till rows at a flat daily figure. */
function history(weeks: number, perDay = 5000, venue: V = "BURLEIGH"): LiveLabourRows["pos"] {
  const out: LiveLabourRows["pos"] = []
  for (let i = 1; i <= weeks * 7; i++) {
    const d = new Date("2026-11-11T00:00:00Z")
    d.setUTCDate(d.getUTCDate() - i)
    out.push({ date: d.toISOString().split("T")[0], venue, exGst: perDay, source: "EMAIL" })
  }
  return out
}
const till = (date: string, exGst: number, source: "API" | "EMAIL" = "EMAIL", venue: V = "BURLEIGH") => ({ date, venue, exGst, source })

const base = (over: Partial<LiveLabourRows> = {}): LiveLabourRows => ({ labourShifts: [], pos: [], uber: [], events: [], forecasts: [], hourlyHistory: [], labourMultiplier: MULT, ...over })
const venue = (r: LiveLabourRows, now: Date, v: V = "BURLEIGH") => buildLiveLabourSnapshot(r, now).venues.find((x) => x.venue === v)!
const near = (a: number | null, b: number, msg?: string) => assert.ok(a != null && Math.abs(a - b) < 0.011, `${msg ?? ""} got ${a}, want ${b}`)

describe("live wages: Brisbane day boundaries (AEST = UTC+10)", () => {
  test("aestDateKey: 13:59 UTC is still that Brisbane day, 14:00 UTC is the next", () => {
    assert.equal(aestDateKey(new Date("2026-11-14T13:59:59Z")), "2026-11-14")
    assert.equal(aestDateKey(new Date("2026-11-14T14:00:00Z")), "2026-11-15")
  })

  test("half past midnight Sunday: a late Saturday shift is locked, a shift that began after midnight is today", () => {
    const now = at("2026-11-15", "00:30") // Sat 14:30 UTC
    const v = venue(
      base({
        labourShifts: [
          sheet("2026-11-14", "18:00", "23:45", 300), // Saturday night, UTC Saturday too
          sheet("2026-11-15", "00:05", "00:30", 20), // baker on at 12:05 am Sunday = Sat 14:05 UTC
        ],
        pos: [till("2026-11-14", 6000)],
      }),
      now,
    )
    assert.equal(v.locked.days, 4)
    near(v.locked.labour, 300 * MULT)
    near(v.today.labourSoFar, 20 * MULT)
    near(v.locked.revenue, 6000)
    near(v.locked.pct, ((300 * MULT) / 6000) * 100)
  })

  test("Wednesday 4 am baker (Tuesday 18:00 UTC) is this week's Wednesday, and Wednesday has nothing locked", () => {
    const now = at("2026-11-11", "06:00")
    const snap = buildLiveLabourSnapshot(base({ labourShifts: [sheet("2026-11-11", "04:00", "06:00", 80, "BURLEIGH", "Pastry")] }), now)
    assert.equal(snap.weekStart, "2026-11-11")
    assert.equal(snap.weekEnd, "2026-11-17")
    const v = snap.venues.find((x) => x.venue === "BURLEIGH")!
    assert.equal(v.locked.days, 0)
    assert.equal(v.locked.labour, 0)
    assert.equal(v.locked.pct, null)
    near(v.today.labourSoFar, 80 * MULT)
    assert.equal(v.coverage.daysRemaining, 6)
  })

  test("Tuesday 11:30 pm is still this week with six days locked; midnight starts a new week", () => {
    const late = buildLiveLabourSnapshot(base(), at("2026-11-17", "23:30"))
    assert.equal(late.weekStart, "2026-11-11")
    assert.equal(late.venues[0].coverage.daysLocked, 6)
    assert.equal(late.venues[0].coverage.daysRemaining, 0)
    const next = buildLiveLabourSnapshot(base(), at("2026-11-18", "00:00"))
    assert.equal(next.weekStart, "2026-11-18")
    assert.equal(next.venues[0].coverage.daysLocked, 0)
  })

  test("daily salary rows sit at 00:00 Brisbane: yesterday's is locked, today's and tomorrow's are not", () => {
    const now = at("2026-11-13", "09:00") // Friday
    const v = venue(base({ labourShifts: WEEK.map((d) => salary(d, 200)), pos: [till("2026-11-11", 5000), till("2026-11-12", 5000)] }), now)
    assert.equal(v.locked.days, 2)
    near(v.locked.labour, 2 * 200 * MULT)
    // The projection carries all seven.
    near(v.labourProjected, 7 * 200 * MULT)
    // Salary is not "clocked today".
    assert.equal(v.today.labourSoFar, 0)
    assert.equal(v.today.labourRestOfDay, 0)
  })
})

describe("live wages: TIMESHEET and ROSTER are never counted twice", () => {
  const now = at("2026-11-15", "10:00")

  test("a shift underway: the timesheet so far plus only the roster part still to run", () => {
    const v = venue(base({ labourShifts: [sheet("2026-11-15", "06:00", "10:00", 100), roster("2026-11-15", "06:00", "14:00", 200)] }), now)
    near(v.labourToDate, 100 * MULT)
    near(v.labourProjected, (100 + 100) * MULT) // never 100 + 200
    near(v.today.labourRestOfDay, 100 * MULT)
  })

  test("a roster shift that has finished adds nothing, clocked or not", () => {
    const v = venue(base({ labourShifts: [sheet("2026-11-15", "05:00", "09:00", 120), roster("2026-11-15", "05:00", "09:00", 120), roster("2026-11-14", "06:00", "14:00", 250)] }), now)
    near(v.labourProjected, 120 * MULT)
    assert.equal(v.today.labourRestOfDay, 0)
  })

  test("a roster shift ending exactly now, a zero-length shift and one that ends before it starts: nothing, and no NaN", () => {
    const v = venue(
      base({
        labourShifts: [
          roster("2026-11-15", "06:00", "10:00", 100), // ends on the dot
          roster("2026-11-15", "10:00", "10:00", 90), // zero length at now
          { venue: "BURLEIGH", area: "Kitchen", cost: 70, source: "ROSTER", shiftStart: at("2026-11-15", "09:00"), shiftEnd: at("2026-11-15", "08:00") },
        ],
      }),
      now,
    )
    assert.equal(v.labourProjected, 0)
    assert.equal(v.today.labourRestOfDay, 0)
    assert.equal(v.overallProjectedPct, null)
  })

  test("a salary row is whole whatever the clock says: not prorated at 12:30 am inside its placeholder hour", () => {
    const v = venue(base({ labourShifts: [salary("2026-11-15", 200)] }), at("2026-11-15", "00:30"))
    near(v.labourProjected, 200 * MULT)
    assert.equal(v.today.labourRestOfDay, 0)
  })

  test("an overnight roster shift begun yesterday and still running counts only what is left", () => {
    const v = venue(base({ labourShifts: [roster("2026-11-14", "22:00", "06:00", 0)].map((s) => ({ ...s, cost: 240, shiftEnd: at("2026-11-15", "06:00") })) }), at("2026-11-15", "02:00"))
    near(v.labourProjected, 120 * MULT)
    assert.equal(v.locked.labour, 0)
  })

  test("a salaried person's own roster row ($0) adds nothing on top of the salary roll-up", () => {
    const v = venue(base({ labourShifts: [roster("2026-11-15", "12:00", "20:00", 0), salary("2026-11-15", 200)] }), now)
    near(v.labourProjected, 200 * MULT)
  })
})

describe("live wages: venues are kept apart", () => {
  test("Beach House wages, takings and salaries never land on Burleigh", () => {
    const now = at("2026-11-15", "10:00")
    const r = base({
      labourShifts: [
        sheet("2026-11-12", "06:00", "14:00", 1000, "BEACH_HOUSE", "Kitchen"),
        salary("2026-11-12", 300, "BEACH_HOUSE", "Salary Chef Currumbin"),
        sheet("2026-11-12", "06:00", "14:00", 400),
      ],
      pos: [till("2026-11-12", 9000, "EMAIL", "BEACH_HOUSE"), till("2026-11-12", 4000)],
      uber: [{ date: "2026-11-12", venue: "BEACH_HOUSE", salesIncGst: 1100 }],
    })
    const b = venue(r, now)
    near(b.locked.labour, 400 * MULT)
    near(b.locked.revenue, 4000)
    const bh = venue(r, now, "BEACH_HOUSE")
    near(bh.locked.labour, 1300 * MULT)
    near(bh.locked.revenue, 10000)
    near(bh.locked.pct, ((1300 * MULT) / 10000) * 100)
  })

  test("salary is locked per venue on its own day: a single Beach House Wednesday row is not spread", () => {
    const now = at("2026-11-15", "10:00")
    const r = base({ labourShifts: [...WEEK.map((d) => salary(d, 200)), salary("2026-11-11", 2100, "BEACH_HOUSE", "Salary Chef Currumbin")] })
    near(venue(r, now).locked.labour, 4 * 200 * MULT)
    near(venue(r, now, "BEACH_HOUSE").locked.labour, 2100 * MULT)
  })
})

describe("live wages: forecast rules carried over from before the refactor", () => {
  test("thin history (one earlier week): the manager's forecast, a seventh per day still to come and for today with no till figure", () => {
    const now = at("2026-11-13", "05:00") // Friday before open
    const v = venue(base({ pos: [...history(1), till("2026-11-11", 4000), till("2026-11-12", 4200)], forecasts: [{ venue: "BURLEIGH", amount: 35000 }] }), now)
    near(v.revenueToDate, 8200)
    near(v.today.revenueRestOfDay, 5000)
    near(v.revenueProjected, 8200 + 5 * 5000) // Fri + Sat to Tue
  })

  test("no history and no forecast (or a $0 one): the average of the finished days", () => {
    const now = at("2026-11-13", "05:00")
    for (const forecasts of [[], [{ venue: "BURLEIGH" as const, amount: 0 }]]) {
      const v = venue(base({ pos: [till("2026-11-11", 4000), till("2026-11-12", 4200)], forecasts }), now)
      near(v.revenueProjected, 8200 + 5 * 4100)
    }
  })

  test("the week's scale needs three finished days with history: on Friday (two) a strong week is not scaled up yet", () => {
    const pos = [...history(4), till("2026-11-11", 10000), till("2026-11-12", 10000)]
    const fri = venue(base({ pos }), at("2026-11-13", "05:00"))
    near(fri.revenueProjected, 20000 + 5 * 5000)
    const sat = venue(base({ pos: [...pos, till("2026-11-13", 10000)] }), at("2026-11-14", "05:00"))
    near(sat.revenueProjected, 30000 + 4 * 10000) // 2x the medians from Saturday
  })

  test("a dead week (finished days at $0) never divides by zero: no locked %, the rest forecast at zero", () => {
    const v = venue(base({ labourShifts: [sheet("2026-11-11", "06:00", "14:00", 500)], pos: [...history(4), till("2026-11-11", 0), till("2026-11-12", 0), till("2026-11-13", 0)] }), at("2026-11-14", "05:00"))
    assert.equal(v.locked.pct, null)
    near(v.locked.labour, 500 * MULT)
    assert.equal(v.revenueProjected, 0)
    assert.equal(v.overallProjectedPct, null)
    for (const b of v.buckets) assert.equal(b.projectedPct, null)
  })

  test("today's intraday figure with thin weekday history: stands as it is, nothing added", () => {
    const now = at("2026-11-15", "10:00")
    const hourly = ["2026-11-08", "2026-11-01"].flatMap((date) => [8, 9, 10, 11].map((hour) => ({ date, venue: "BURLEIGH" as const, hour, revenueIncGst: 110 })))
    const v = venue(base({ pos: [...history(1), till("2026-11-15", 1500, "API")], hourlyHistory: hourly, forecasts: [{ venue: "BURLEIGH", amount: 35000 }] }), now)
    near(v.today.shareOfDayDone, 0.5)
    assert.equal(v.today.revenueRestOfDay, 0)
  })

  test("another venue's hourly rows and today's own hourly rows never shape the day", () => {
    const now = at("2026-11-15", "10:00")
    const v = venue(
      base({
        pos: [...history(4), till("2026-11-15", 1500, "API")],
        hourlyHistory: [
          ...["2026-11-08", "2026-11-01"].flatMap((date) => [6, 7, 8, 9, 10, 11, 12, 13].map((hour) => ({ date, venue: "BEACH_HOUSE" as const, hour, revenueIncGst: 110 }))),
          { date: "2026-11-15", venue: "BURLEIGH", hour: 7, revenueIncGst: 500 },
          { date: "2026-11-08", venue: "BURLEIGH", hour: 7, revenueIncGst: 500 },
        ],
      }),
      now,
    )
    assert.equal(v.today.shareOfDayDone, null) // one Burleigh day only
    assert.equal(v.today.revenueRestOfDay, 0)
  })
})

describe("shareOfDayDone: nasty input", () => {
  const two = ["2026-11-08", "2026-11-01"].flatMap((date) => [{ date, hour: 8, revenueIncGst: 400 }, { date, hour: 12, revenueIncGst: 600 }])

  test("minutes outside the day are clamped, never below 0 or above 1", () => {
    assert.equal(shareOfDayDone(two, -30), 0)
    assert.equal(shareOfDayDone(two, 24 * 60), 1)
    assert.equal(shareOfDayDone(two, 99999), 1)
  })

  test("a refund hour (negative) is ignored, and days that net to nothing are dropped", () => {
    const rows = [...two, { date: "2026-11-08", hour: 9, revenueIncGst: -900 }, { date: "2026-10-25", hour: 9, revenueIncGst: -50 }]
    assert.equal(shareOfDayDone(rows, 10 * 60), 0.4)
  })

  test("fractional and out of range hours are skipped", () => {
    const rows = [...two, { date: "2026-11-08", hour: 8.5, revenueIncGst: 5000 }, { date: "2026-11-08", hour: -1, revenueIncGst: 5000 }]
    assert.equal(shareOfDayDone(rows, 10 * 60), 0.4)
  })
})

describe("live wages: a salaried day at Tea Garden", () => {
  test("a single daily salary row on the Wednesday is locked in full, not a seventh per day", () => {
    const v = venue(base({ labourShifts: [salary("2026-11-11", 350, "TEA_GARDEN", "Salary TG Kitchen")], pos: [till("2026-11-11", 2000, "EMAIL", "TEA_GARDEN")] }), at("2026-11-15", "10:00"), "TEA_GARDEN")
    near(v.locked.labour, 350 * MULT)
  })
})
