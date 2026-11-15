import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { buildLiveLabourSnapshot, shareOfDayDone, type LiveLabourRows } from "./live"

/**
 * Trading week Wed 11 to Tue 17 Nov 2026. "Now" is Sunday 15 Nov, 10:00 am
 * in Brisbane (00:00 UTC), so Wed to Sat are finished days.
 */
const NOW = new Date("2026-11-15T00:00:00Z")
const MULT = 1.12
const WEEK = ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]
const LOCKED = WEEK.slice(0, 4)

/** An instant from a Brisbane date and clock time. */
const at = (date: string, hhmm: string) => new Date(new Date(`${date}T${hhmm}:00Z`).getTime() - 10 * 3600_000)

type Shift = LiveLabourRows["labourShifts"][number]
const sheet = (date: string, from: string, to: string, cost: number, area = "Kitchen"): Shift => ({ venue: "BURLEIGH", area, cost, source: "TIMESHEET", shiftStart: at(date, from), shiftEnd: at(date, to) })
const roster = (date: string, from: string, to: string, cost: number, area = "Kitchen"): Shift => ({ venue: "BURLEIGH", area, cost, source: "ROSTER", shiftStart: at(date, from), shiftEnd: at(date, to) })
const salary = (date: string, cost: number): Shift => ({ venue: "BURLEIGH", area: "Salary BOH BURLEIGH", cost, source: "ROSTER", shiftStart: at(date, "00:00"), shiftEnd: at(date, "01:00") })

/** Four earlier weeks at a flat $5,000 a day, so every weekday median is $5,000. */
function history(): LiveLabourRows["pos"] {
  const out: LiveLabourRows["pos"] = []
  for (let i = 1; i <= 28; i++) {
    const d = new Date("2026-11-11T00:00:00Z")
    d.setUTCDate(d.getUTCDate() - i)
    out.push({ date: d.toISOString().split("T")[0], venue: "BURLEIGH", exGst: 5000, source: "EMAIL" })
  }
  return out
}
const lockedPos = (): LiveLabourRows["pos"] => LOCKED.map((date) => ({ date, venue: "BURLEIGH" as const, exGst: 5000, source: "EMAIL" as const }))

/** Two earlier Sundays trading 6 am to 2 pm at an even $110 an hour inc GST. */
function sundayShape(): NonNullable<LiveLabourRows["hourlyHistory"]> {
  const out: NonNullable<LiveLabourRows["hourlyHistory"]> = []
  for (const date of ["2026-11-08", "2026-11-01"]) for (let hour = 6; hour < 14; hour++) out.push({ date, venue: "BURLEIGH", hour, revenueIncGst: 110 })
  return out
}

function rows(over: Partial<LiveLabourRows> = {}): LiveLabourRows {
  return {
    labourShifts: [
      ...LOCKED.map((d) => sheet(d, "06:00", "14:00", 1000)),
      ...WEEK.map((d) => salary(d, 200)),
    ],
    pos: [...history(), ...lockedPos()],
    uber: [],
    events: [],
    forecasts: [],
    hourlyHistory: sundayShape(),
    labourMultiplier: MULT,
    ...over,
  }
}
const burleigh = (r: LiveLabourRows, now = NOW) => buildLiveLabourSnapshot(r, now).venues.find((v) => v.venue === "BURLEIGH")!
const near = (a: number | null, b: number, msg?: string) => assert.ok(a != null && Math.abs(a - b) < 0.011, `${msg ?? ""} got ${a}, want ${b}`)

describe("live wages: locked (finished days, actual against actual)", () => {
  test("timesheets and that day's salary over the same days' revenue, on-costs included", () => {
    const v = burleigh(rows())
    assert.equal(v.locked.days, 4)
    near(v.locked.labour, (4 * 1000 + 4 * 200) * MULT) // 5,376
    near(v.locked.revenue, 20000)
    near(v.locked.pct, 26.88)
  })

  test("Uber and event revenue on a finished day count in the locked revenue", () => {
    const v = burleigh(rows({ uber: [{ date: "2026-11-12", venue: "BURLEIGH", salesIncGst: 1100 }], events: [{ date: "2026-11-13", venue: "BURLEIGH", exGst: 2000 }] }))
    near(v.locked.revenue, 23000)
  })

  test("a single salary row on the Wednesday is that day's salary, locked in full once Wednesday is done", () => {
    const base = rows()
    const v = burleigh({ ...base, labourShifts: [...LOCKED.map((d) => sheet(d, "06:00", "14:00", 1000)), salary("2026-11-11", 350)] })
    near(v.locked.labour, (4000 + 350) * MULT)
    near(v.labourProjected, (4000 + 350) * MULT)
  })

  test("today's wages and takings are never in the locked figure", () => {
    const v = burleigh(rows({
      labourShifts: [...rows().labourShifts, sheet("2026-11-15", "06:00", "10:00", 100)],
      pos: [...rows().pos, { date: "2026-11-15", venue: "BURLEIGH", exGst: 1500, source: "API" }],
    }))
    near(v.locked.labour, 5376)
    near(v.locked.revenue, 20000)
    near(v.today.labourSoFar, 100 * MULT)
    near(v.today.revenueSoFar, 1500)
  })

  test("Wednesday: nothing is locked yet, so no locked %", () => {
    const v = burleigh(rows({ labourShifts: [sheet("2026-11-11", "06:00", "09:00", 90)], pos: history() }), at("2026-11-11", "09:00"))
    assert.equal(v.locked.days, 0)
    assert.equal(v.locked.pct, null)
  })

  test("a rostered shift that finished with nobody clocked is not wages", () => {
    const v = burleigh(rows({ labourShifts: [...rows().labourShifts, roster("2026-11-13", "06:00", "14:00", 250)] }))
    near(v.locked.labour, 5376)
    near(v.labourProjected, (4000 + 1400) * MULT)
  })
})

describe("live wages: today counts as a whole day on both sides", () => {
  const today = (): LiveLabourRows =>
    rows({
      labourShifts: [
        ...rows().labourShifts,
        sheet("2026-11-15", "06:00", "10:00", 100), // clocked on, live
        roster("2026-11-15", "06:00", "14:00", 200), // the same shift, half still to run
        roster("2026-11-15", "12:00", "16:00", 80), // not started
        roster("2026-11-16", "06:00", "14:00", 300),
        roster("2026-11-17", "06:00", "14:00", 300),
      ],
      pos: [...rows().pos, { date: "2026-11-15", venue: "BURLEIGH", exGst: 1500, source: "API" }],
    })

  test("intraday takings + the usual rest of the day (half of a $5,000 Sunday at 10 am)", () => {
    const v = burleigh(today())
    assert.equal(v.today.live, true)
    near(v.today.shareOfDayDone, 0.5)
    near(v.today.revenueRestOfDay, 2500)
    // 20,000 locked + 1,500 so far + 2,500 rest of today + Mon and Tue at 5,000.
    near(v.revenueProjected, 34000)
    near(v.revenueToDate, 21500)
  })

  test("wages: clocked so far + the rest of shifts underway + shifts not started + the week's salaries", () => {
    const v = burleigh(today())
    near(v.today.labourRestOfDay, (100 + 80) * MULT)
    near(v.labourToDate, 4100 * MULT)
    near(v.labourProjected, (4100 + 100 + 80 + 600 + 1400) * MULT) // 7,033.60
    near(v.overallProjectedPct, ((6280 * MULT) / 34000) * 100)
  })

  test("the chefs' band reads off the same projected revenue", () => {
    const v = burleigh(today())
    const chefs = v.buckets.find((b) => b.key === "chefsKp")!
    near(chefs.projectedTotal, 6280 * MULT)
    near(chefs.projectedPct, ((6280 * MULT) / 34000) * 100)
    assert.equal(chefs.status, "red")
  })

  test("a final (EMAIL) figure for today adds nothing for the rest of the day", () => {
    const r = today()
    r.pos = r.pos.map((p) => (p.date === "2026-11-15" ? { ...p, exGst: 4200, source: "EMAIL" as const } : p))
    const v = burleigh(r)
    assert.equal(v.today.live, false)
    near(v.today.revenueRestOfDay, 0)
    near(v.revenueProjected, 20000 + 4200 + 10000)
  })

  test("after close the usual share is 100%, so a slow day is not padded back up", () => {
    const r = today()
    r.labourShifts = rows().labourShifts
    const v = burleigh(r, at("2026-11-15", "20:00"))
    near(v.today.shareOfDayDone, 1)
    near(v.today.revenueRestOfDay, 0)
    near(v.revenueProjected, 20000 + 1500 + 10000)
  })

  test("no till figure yet today: the whole day is forecast from its weekday", () => {
    const v = burleigh(rows(), at("2026-11-15", "05:30"))
    near(v.today.revenueSoFar, 0)
    near(v.today.revenueRestOfDay, 5000)
    near(v.revenueProjected, 35000)
  })

  test("no hourly history: intraday takings stand as they are, nothing invented", () => {
    const v = burleigh({ ...today(), hourlyHistory: [] })
    assert.equal(v.today.shareOfDayDone, null)
    near(v.today.revenueRestOfDay, 0)
    near(v.revenueProjected, 31500)
  })

  test("a strong week scales the rest of today and the days to come", () => {
    const r = today()
    r.pos = r.pos.map((p) => (LOCKED.includes(p.date) ? { ...p, exGst: 6000 } : p))
    const v = burleigh(r)
    // Locked days ran at 1.2 times their medians.
    near(v.today.revenueRestOfDay, 3000)
    near(v.revenueProjected, 24000 + 1500 + 3000 + 12000)
  })

  test("no rows at all: zeros and nulls, never a divide by zero", () => {
    const v = burleigh({ labourShifts: [], pos: [], uber: [], events: [], forecasts: [], labourMultiplier: MULT })
    assert.equal(v.overallProjectedPct, null)
    assert.equal(v.locked.pct, null)
    assert.equal(v.labourProjected, 0)
    assert.equal(v.revenueProjected, 0)
  })
})

describe("live wages: day by day", () => {
  const r = (): LiveLabourRows =>
    rows({
      labourShifts: [
        ...rows().labourShifts,
        sheet("2026-11-15", "06:00", "10:00", 100),
        roster("2026-11-15", "06:00", "14:00", 200),
        roster("2026-11-15", "12:00", "16:00", 80),
        roster("2026-11-16", "06:00", "14:00", 300),
      ],
      pos: [...rows().pos, { date: "2026-11-15", venue: "BURLEIGH", exGst: 1500, source: "API" }],
    })

  test("seven rows Wed to Tue: four locked, today, two ahead", () => {
    const d = burleigh(r()).days
    assert.deepEqual(d.map((x) => x.dayName), ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"])
    assert.deepEqual(d.map((x) => x.state), ["locked", "locked", "locked", "locked", "today", "ahead", "ahead"])
  })

  test("a finished day is its own timesheets + salary on its own revenue", () => {
    const thu = burleigh(r()).days[1]
    near(thu.labour, 1200 * MULT)
    near(thu.revenue, 5000)
    near(thu.pct, ((1200 * MULT) / 5000) * 100)
  })

  test("the locked days add up to the locked figure, and every day to the week", () => {
    const v = burleigh(r())
    near(v.days.filter((x) => x.state === "locked").reduce((s, x) => s + x.labour, 0), v.locked.labour)
    near(v.days.reduce((s, x) => s + x.labour, 0), v.labourProjected)
  })

  test("today: wages for the whole day (clocked + salary + still to run) on the takings so far", () => {
    const sun = burleigh(r()).days[4]
    near(sun.labourSoFar ?? null, (100 + 200) * MULT)
    near(sun.labour, (100 + 200 + 100 + 80) * MULT) // 537.60
    near(sun.revenue, 1500)
    near(sun.pct, ((480 * MULT) / 1500) * 100)
  })

  test("a day ahead is its roster + salary on its forecast; no takings today yet gives no %", () => {
    const v = burleigh(r())
    near(v.days[5].labour, (300 + 200) * MULT)
    near(v.days[5].revenue, 5000)
    near(v.days[6].labour, 200 * MULT)
    const early = burleigh(rows(), at("2026-11-15", "05:30")).days[4]
    assert.equal(early.revenue, 0)
    assert.equal(early.pct, null)
  })
})

describe("live wages: day by day, edges (test guard, 15 Nov 2026)", () => {
  const sumAll = (v: ReturnType<typeof burleigh>) => v.days.reduce((s, x) => s + x.labour, 0)
  const sumLocked = (v: ReturnType<typeof burleigh>) => v.days.filter((x) => x.state === "locked").reduce((s, x) => s + x.labour, 0)

  test("an overnight shift underway (Sat 10 pm to Sun 2 am, now Sun 12:30 am): clocked part stays on Saturday, the rest lands on today, sums hold", () => {
    const now = at("2026-11-15", "00:30")
    const v = burleigh(
      rows({
        labourShifts: [
          ...rows().labourShifts,
          { venue: "BURLEIGH", area: "Bar", cost: 75, source: "TIMESHEET", shiftStart: at("2026-11-14", "22:00"), shiftEnd: at("2026-11-15", "00:30") },
          { venue: "BURLEIGH", area: "Bar", cost: 120, source: "ROSTER", shiftStart: at("2026-11-14", "22:00"), shiftEnd: at("2026-11-15", "02:00") },
        ],
      }),
      now
    )
    const sat = v.days[3]
    const sun = v.days[4]
    assert.equal(sat.state, "locked")
    assert.equal(sun.state, "today")
    near(sat.labour, (1000 + 200 + 75) * MULT)
    // 1.5 of the 4 rostered hours still to run = $45, plus Sunday's salary.
    near(sun.labour, (200 + 45) * MULT)
    near(sun.labourSoFar ?? null, 200 * MULT)
    near(sumLocked(v), v.locked.labour)
    near(sumAll(v), v.labourProjected)
    near(v.today.labourRestOfDay, 45 * MULT)
  })

  test("one minute either side of Brisbane midnight: the day flips from today to locked and nothing is counted twice", () => {
    const r = rows({
      labourShifts: [...rows().labourShifts, sheet("2026-11-15", "06:00", "14:00", 900), roster("2026-11-15", "06:00", "14:00", 900)],
      pos: [...rows().pos, { date: "2026-11-15", venue: "BURLEIGH", exGst: 4000, source: "EMAIL" }],
    })
    const before = burleigh(r, at("2026-11-15", "23:59"))
    assert.deepEqual(before.days.map((x) => x.state), ["locked", "locked", "locked", "locked", "today", "ahead", "ahead"])
    near(before.days[4].labour, (900 + 200) * MULT) // the finished roster row adds nothing
    near(before.days[4].labourSoFar ?? null, (900 + 200) * MULT)

    const after = burleigh(r, at("2026-11-16", "00:01"))
    assert.deepEqual(after.days.map((x) => x.state), ["locked", "locked", "locked", "locked", "locked", "today", "ahead"])
    near(after.days[4].labour, (900 + 200) * MULT)
    near(after.days[4].pct, ((1100 * MULT) / 4000) * 100)
    assert.equal(after.days[4].labourSoFar, undefined)
    for (const v of [before, after]) {
      near(sumLocked(v), v.locked.labour)
      near(sumAll(v), v.labourProjected)
    }
  })

  test("Wednesday 12:05 am and Tuesday 11:55 pm: still seven rows of the right week", () => {
    const wed = burleigh(rows({ pos: history() }), at("2026-11-11", "00:05"))
    assert.deepEqual(wed.days.map((x) => x.date), WEEK)
    assert.deepEqual(wed.days.map((x) => x.state), ["today", "ahead", "ahead", "ahead", "ahead", "ahead", "ahead"])
    near(sumLocked(wed), 0)
    near(wed.locked.labour, 0)
    near(sumAll(wed), wed.labourProjected)

    const tue = burleigh(rows(), at("2026-11-17", "23:55"))
    assert.deepEqual(tue.days.map((x) => x.date), WEEK)
    assert.deepEqual(tue.days.map((x) => x.state), ["locked", "locked", "locked", "locked", "locked", "locked", "today"])
    near(sumLocked(tue), tue.locked.labour)
    near(sumAll(tue), tue.labourProjected)
  })

  test("a finished day with no takings in, and a week with no rows: no %, never Infinity or NaN", () => {
    const r = rows()
    r.pos = r.pos.filter((p) => p.date !== "2026-11-13")
    const fri = burleigh(r).days[2]
    near(fri.labour, 1200 * MULT)
    assert.equal(fri.revenue, 0)
    assert.equal(fri.pct, null)

    const empty = burleigh({ labourShifts: [], pos: [], uber: [], events: [], forecasts: [], labourMultiplier: MULT })
    assert.equal(empty.days.length, 7)
    for (const d of empty.days) {
      assert.equal(d.labour, 0)
      assert.equal(d.revenue, 0)
      assert.equal(d.pct, null)
    }
  })

  test("days ahead use the same forecast as the week: today so far + rest of today + the ahead rows = revenueProjected", () => {
    const r = rows({ pos: [...rows().pos.map((p) => (LOCKED.includes(p.date) ? { ...p, exGst: 6000 } : p)), { date: "2026-11-15", venue: "BURLEIGH", exGst: 1500, source: "API" }] })
    const v = burleigh(r)
    near(v.days[5].revenue, 6000)
    near(v.days[6].revenue, 6000)
    near(v.days.reduce((s, x) => s + x.revenue, 0) + v.today.revenueRestOfDay, v.revenueProjected)
  })

  test("a credit (negative timesheet correction) on a finished day lowers that day and the sums still hold", () => {
    const v = burleigh(rows({ labourShifts: [...rows().labourShifts, sheet("2026-11-12", "06:00", "07:00", -50)] }))
    near(v.days[1].labour, (1000 + 200 - 50) * MULT)
    near(sumLocked(v), v.locked.labour)
    near(sumAll(v), v.labourProjected)
  })

  test("another venue's shifts never leak into Burleigh's days", () => {
    const base = burleigh(rows())
    const other = burleigh(rows({ labourShifts: [...rows().labourShifts, { ...sheet("2026-11-12", "06:00", "14:00", 5000), venue: "BEACH_HOUSE" as const }] }))
    assert.deepEqual(other.days, base.days)
  })
})

describe("shareOfDayDone", () => {
  const day = (date: string, hours: Record<number, number>) => Object.entries(hours).map(([h, v]) => ({ date, hour: Number(h), revenueIncGst: v }))
  const two = [...day("2026-11-08", { 7: 100, 8: 300, 9: 600 }), ...day("2026-11-01", { 7: 100, 8: 300, 9: 600 })]

  test("counts whole hours before now and the elapsed part of the current hour", () => {
    assert.equal(shareOfDayDone(two, 8 * 60), 0.1)
    assert.equal(shareOfDayDone(two, 8 * 60 + 30), 0.25)
    assert.equal(shareOfDayDone(two, 10 * 60), 1)
    assert.equal(shareOfDayDone(two, 0), 0)
  })

  test("one day of history is not a pattern", () => {
    assert.equal(shareOfDayDone(day("2026-11-08", { 7: 100, 8: 300 }), 8 * 60), null)
    assert.equal(shareOfDayDone([], 8 * 60), null)
  })

  test("median across days, empty days and bad hours ignored", () => {
    const rows = [...two, ...day("2026-10-25", { 7: 500, 8: 300, 9: 200 }), ...day("2026-10-18", { 9: 0 }), { date: "2026-10-25", hour: 24, revenueIncGst: 999 }]
    // Shares at 8 am: 0.1, 0.1, 0.5. Median 0.1.
    assert.equal(shareOfDayDone(rows, 8 * 60), 0.1)
  })
})
