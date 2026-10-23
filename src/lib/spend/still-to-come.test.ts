import { test } from "node:test"
import assert from "node:assert/strict"
import { usualStillToCome, STILL_TO_COME_MIN_ROW, type SupplierDayRow } from "./still-to-come"

// trading-day indices, 0 = Wed
const WED = 0, FRI = 2, SUN = 4, MON = 5, TUE = 6
const none = new Map<string, Set<number>>()

/** The same delivery every history week 0..weeks-1. */
function weekly(supplier: string, day: number, amount: number, weeks = 8): SupplierDayRow[] {
  return Array.from({ length: weeks }, (_, week) => ({ supplier, week, day, amount }))
}

// Burleigh's standing Monday and Tuesday, roughly as the 8 weeks to 14 Oct 2026 had it
const BURLEIGH: SupplierDayRow[] = [
  ...weekly("Bidfood", FRI, 2200),
  ...weekly("Bidfood", MON, 1800),
  ...weekly("Bidfood", TUE, 350),
  ...weekly("Eustralis", MON, 1200),
  ...weekly("Eustralis", TUE, 170),
  ...weekly("Gold Coast Eggs", FRI, 860),
  ...weekly("Gold Coast Eggs", MON, 670),
  ...weekly("Son of a Bunn", MON, 450),
  ...weekly("Pixel Bread", SUN, 356),
  ...weekly("Pixel Bread", MON, 262),
  ...weekly("Pixel Bread", TUE, 290),
  ...weekly("EasyVend", SUN, 1385),
]

const ALL_WEEKS = [0, 1, 2, 3, 4, 5, 6, 7]

test("Sunday: Monday and Tuesday's usual still to come, plus Sunday's from suppliers not in yet", () => {
  // Sunday 5pm: EasyVend's Sunday milk is in, Pixel's Sunday bread is not
  const r = usualStillToCome({
    history: BURLEIGH,
    weeks: ALL_WEEKS,
    scale: 1,
    todayIdx: SUN,
    invoiced: new Map([["EasyVend", new Set([SUN])]]),
  })!
  const by = Object.fromEntries(r.rows.map((x) => [x.supplier, x]))
  assert.equal(by.Bidfood.amount, 2150)
  assert.deepEqual(by.Bidfood.days, ["Mon", "Tue"])
  assert.equal(by.Eustralis.amount, 1370)
  assert.equal(by["Gold Coast Eggs"].amount, 670) // Friday's eggs are not to come
  assert.equal(by["Pixel Bread"].amount, 908)
  assert.deepEqual(by["Pixel Bread"].days, ["Sun", "Mon", "Tue"])
  assert.equal(by.EasyVend, undefined) // already delivered today
  assert.equal(r.total, 2150 + 1370 + 670 + 450 + 908)
  // biggest first
  assert.deepEqual(r.rows.map((x) => x.supplier), ["Bidfood", "Eustralis", "Pixel Bread", "Gold Coast Eggs", "Son of a Bunn"])
})

test("a supplier that has invoiced for today is done for today, not for the days after", () => {
  const before = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: MON, invoiced: none })!
  const after = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: MON, invoiced: new Map([["Bidfood", new Set([MON])]]) })!
  const bid = (r: typeof before) => r.rows.find((x) => x.supplier === "Bidfood")!
  assert.equal(bid(before).amount, 2150)
  assert.equal(bid(after).amount, 350)
  assert.deepEqual(bid(after).days, ["Tue"])
  assert.equal(before.total - after.total, 1800)
})

test("Tuesday: only Tuesday's usual is left; with everyone in, nothing is", () => {
  const tue = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: TUE, invoiced: none })!
  assert.equal(tue.total, 350 + 170 + 290)
  const allIn = new Map(["Bidfood", "Eustralis", "Pixel Bread"].map((s) => [s, new Set([TUE])]))
  assert.deepEqual(usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: TUE, invoiced: allIn }), { total: 0, rows: [] })
})

test("Wednesday morning: the whole usual week is still to come, and it adds up to a usual week", () => {
  const r = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: WED, invoiced: none })!
  const week = BURLEIGH.reduce((s, x) => s + x.amount, 0) / 8
  assert.equal(r.total, Math.round(week * 100) / 100)
})

test("scaled to this week's trade: a 10% busier week expects 10% more deliveries", () => {
  const base = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: SUN, invoiced: none })!
  const busy = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1.1, todayIdx: SUN, invoiced: none })!
  assert.ok(Math.abs(busy.total - base.total * 1.1) < 0.05, `${busy.total} vs ${base.total * 1.1}`)
})

test("averages over the weeks given: an occasional supplier counts at its weekly average, left-out weeks do not count", () => {
  // Marrow Meats on two Mondays of eight: $300 a Monday on average
  const rows = [...weekly("Marrow Meats", MON, 1200, 2)]
  const r = usualStillToCome({ history: rows, weeks: ALL_WEEKS, scale: 1, todayIdx: SUN, invoiced: none })!
  assert.equal(r.total, 300)
  // Week 7 left out (takings missing that week): its spend is ignored and the average is over 7 weeks
  const withGap = [...weekly("Bidfood", MON, 1400, 7), { supplier: "Bidfood", week: 7, day: MON, amount: 99999 }]
  const g = usualStillToCome({ history: withGap, weeks: [0, 1, 2, 3, 4, 5, 6], scale: 1, todayIdx: SUN, invoiced: none })!
  assert.equal(g.total, 1400)
})

test("credit notes net off inside a supplier; a net credit or a few cents is not 'still to come'", () => {
  const rows: SupplierDayRow[] = [
    ...weekly("The Provedores", MON, 800),
    ...weekly("The Provedores", MON, -500), // weekly credit on the same run
    ...weekly("Pacific Wholesale", SUN, -62),
    ...weekly("Coastal Fresh", TUE, 0.5),
  ]
  const r = usualStillToCome({ history: rows, weeks: ALL_WEEKS, scale: 1, todayIdx: SUN, invoiced: none })!
  assert.deepEqual(r.rows.map((x) => [x.supplier, x.amount]), [["The Provedores", 300]])
  assert.equal(r.total, 300)
  for (const x of r.rows) assert.ok(x.amount >= STILL_TO_COME_MIN_ROW)
})

test("rows add to the total to the cent, whatever the scale", () => {
  for (const scale of [0.7, 1, 1.0333, 1.37]) {
    for (let todayIdx = WED; todayIdx <= TUE; todayIdx++) {
      const r = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale, todayIdx, invoiced: none })!
      const sum = Math.round(r.rows.reduce((s, x) => s + x.amount, 0) * 100) / 100
      assert.equal(r.total, sum, `scale ${scale} day ${todayIdx}`)
      for (const x of r.rows) assert.ok(Number.isFinite(x.amount) && x.amount > 0)
    }
  }
})

test("no history weeks or a broken scale is no estimate, not zero", () => {
  assert.equal(usualStillToCome({ history: BURLEIGH, weeks: [], scale: 1, todayIdx: SUN, invoiced: none }), null)
  for (const scale of [0, -1, NaN, Infinity]) {
    assert.equal(usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale, todayIdx: SUN, invoiced: none }), null, `scale ${scale}`)
  }
})

test("an out-of-range day is clamped, and the input rows are not changed", () => {
  const copy = JSON.parse(JSON.stringify(BURLEIGH))
  const late = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: 9, invoiced: none })!
  assert.deepEqual(late, usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: TUE, invoiced: none }))
  const early = usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: -3, invoiced: none })!
  assert.deepEqual(early, usualStillToCome({ history: BURLEIGH, weeks: ALL_WEEKS, scale: 1, todayIdx: WED, invoiced: none }))
  assert.deepEqual(BURLEIGH, copy)
})
