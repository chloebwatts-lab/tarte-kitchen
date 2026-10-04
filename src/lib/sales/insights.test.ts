import { test } from "node:test"
import assert from "node:assert/strict"
import { comparisonDates, compareHourly, headline, typicalChannels, dailySeries, brisbaneNow, type HourlyRow } from "./insights"

test("comparisonDates: same weekday back 1 / 4 / 8 weeks", () => {
  assert.deepEqual(comparisonDates("2026-10-04", "LAST_WEEK"), ["2026-09-27"])
  assert.deepEqual(comparisonDates("2026-10-04", "WEEKS_4"), ["2026-09-27", "2026-09-20", "2026-09-13", "2026-09-06"])
  assert.equal(comparisonDates("2026-10-04", "WEEKS_8").length, 8)
})

function day(date: string, perHour: Record<number, number>, source = "LIGHTSPEED"): HourlyRow[] {
  return Object.entries(perHour).map(([h, v]) => ({ date, hour: Number(h), revenueIncGst: v, orders: 1, source }))
}

test("compareHourly: averages across days with data, cumulative to now with a part hour", () => {
  const rows = [...day("2026-09-27", { 8: 1000, 9: 2000, 10: 3000 }), ...day("2026-09-20", { 8: 2000, 9: 2000, 10: 1000 }, "ESTIMATE")]
  const c = compareHourly(rows, ["2026-09-27", "2026-09-20", "2026-09-13"], 9 * 60 + 30)
  assert.equal(c.daysUsed, 2)
  assert.equal(c.avgHourly[8], 1500); assert.equal(c.avgHourly[9], 2000); assert.equal(c.avgHourly[10], 2000)
  assert.equal(c.avgDay, 5500)
  // to 9:30: hour 8 full + half of hour 9 => (1000+1000 + 2000+1000)/2 = 2500
  assert.equal(c.avgToNow, 2500)
  assert.equal(c.estimated, true)
  const closed = compareHourly(rows, ["2026-09-27"], null)
  assert.equal(closed.avgToNow, 6000); assert.equal(closed.estimated, false)
})

test("compareHourly: no data gives nulls, not NaN", () => {
  const c = compareHourly([], ["2026-09-27"], 600)
  assert.equal(c.avgDay, null); assert.equal(c.avgToNow, null); assert.equal(c.daysUsed, 0)
})

test("headline: % vs average at this time, without surcharge, on pace, vs last week", () => {
  const cmp = { avgHourly: [], avgDay: 30596, avgToNow: 24532, daysUsed: 4, estimated: false }
  const lw = { avgHourly: [], avgDay: 27810, avgToNow: 22452, daysUsed: 1, estimated: false }
  const h = headline(25036, 1192, cmp, lw)
  assert.equal(h.vsAvgPct, 2.1)
  assert.equal(h.vsAvgDollars, 504)
  assert.equal(h.vsAvgNoSurchargePct, -2.8)
  assert.equal(h.onPaceFor, 31200)
  assert.equal(h.vsLastWeekPct, 11.5)
  assert.equal(h.vsLastWeekDollars, 2584)
})

test("headline: early in the day (under 5% of the average day) does not project", () => {
  const cmp = { avgHourly: [], avgDay: 30000, avgToNow: 900, daysUsed: 4, estimated: false }
  const h = headline(1200, 0, cmp, cmp)
  assert.equal(h.onPaceFor, null)
  assert.equal(h.vsAvgPct, 33.3)
})

test("typicalChannels: share and avg sale over comparison days, OTHER ignored", () => {
  const rows = [
    { date: "2026-09-27", channel: "CAFE", revenueIncGst: 5670, orders: 200 },
    { date: "2026-09-27", channel: "RESTAURANT", revenueIncGst: 4330, orders: 50 },
    { date: "2026-09-27", channel: "OTHER", revenueIncGst: -100, orders: 1 },
    { date: "2026-09-20", channel: "CAFE", revenueIncGst: 5670, orders: 200 },
    { date: "2026-09-20", channel: "RESTAURANT", revenueIncGst: 4330, orders: 50 },
    { date: "2026-08-01", channel: "CAFE", revenueIncGst: 99999, orders: 1 },
  ]
  const t = typicalChannels(rows, ["2026-09-27", "2026-09-20"])
  assert.deepEqual(t.find((x) => x.channel === "CAFE"), { channel: "CAFE", typicalSharePct: 56.7, typicalAvgSale: 28.35 })
  assert.deepEqual(t.find((x) => x.channel === "RESTAURANT"), { channel: "RESTAURANT", typicalSharePct: 43.3, typicalAvgSale: 86.6 })
})

test("dailySeries pairs each day with its weekday comparison average", () => {
  const daily = [
    { date: "2026-10-01", revenueIncGst: 12763, orders: 345 },
    { date: "2026-09-24", revenueIncGst: 12000, orders: null },
    { date: "2026-09-17", revenueIncGst: 10000, orders: null },
  ]
  const s = dailySeries(daily, ["2026-09-30", "2026-10-01"], "WEEKS_4")
  assert.deepEqual(s[0], { date: "2026-09-30", actual: null, compare: null })
  assert.deepEqual(s[1], { date: "2026-10-01", actual: 12763, compare: 11000 })
})

test("brisbaneNow", () => {
  assert.deepEqual(brisbaneNow(new Date("2026-10-04T03:21:00Z")), { date: "2026-10-04", minutes: 13 * 60 + 21 })
  assert.deepEqual(brisbaneNow(new Date("2026-10-04T14:05:00Z")), { date: "2026-10-05", minutes: 5 })
})
