import { test } from "node:test"
import assert from "node:assert/strict"
import { comparisonDates, compareHourly, fillMissingHourly, headline, typicalChannels, dailySeries, brisbaneNow, type HourlyRow } from "./insights"

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

test("fillMissingHourly: a day with a total but no rows gets the weekday shape scaled to its total", () => {
  const shape = [...day("2026-09-16", { 7: 100, 8: 300 }), ...day("2026-09-09", { 7: 300, 8: 500 }), ...day("2026-09-02", { 7: 1, 8: 1 }, "ESTIMATE")]
  const rows = day("2026-09-23", { 7: 200, 8: 400 })
  const totals = [{ date: "2026-09-30", revenueIncGst: 1000, orders: null }, { date: "2026-09-23", revenueIncGst: 999, orders: null }]
  const out = fillMissingHourly(rows, ["2026-09-30", "2026-09-23"], totals, [...shape, ...rows])
  // 23 Sep untouched; 30 Sep estimated from the real days only: shares (0.25+0.375+0.333)/3 and (0.75+0.625+0.667)/3
  assert.deepEqual(out.filter((r) => r.date === "2026-09-23"), rows)
  const est = out.filter((r) => r.date === "2026-09-30")
  assert.equal(est.length, 2)
  assert.ok(est.every((r) => r.source === "ESTIMATE"))
  assert.equal(est.find((r) => r.hour === 7)?.revenueIncGst, 319.44)
  assert.equal(est.find((r) => r.hour === 8)?.revenueIncGst, 680.56)
  // so the comparison now counts it, flagged as estimated
  const c = compareHourly(out, ["2026-09-30", "2026-09-23"], 8 * 60)
  assert.equal(c.daysUsed, 2); assert.equal(c.estimated, true); assert.equal(c.avgToNow, 259.72)
})

test("fillMissingHourly: nothing to borrow, or no day total, adds nothing", () => {
  const totals = [{ date: "2026-09-30", revenueIncGst: 1000, orders: null }]
  assert.deepEqual(fillMissingHourly([], ["2026-09-30"], totals, day("2026-09-23", { 7: 5 }, "ESTIMATE")), [])
  assert.deepEqual(fillMissingHourly([], ["2026-09-30"], [], day("2026-09-23", { 7: 5 })), [])
})

test("fillMissingHourly: zero, negative (credit) or absent day totals are skipped, other missing days still filled", () => {
  // Wednesday shape from two real Lightspeed days, 7am to 2pm
  const shape = [...day("2026-09-16", { 7: 800, 8: 1500, 9: 2200, 10: 2600, 11: 2800, 12: 2400, 13: 900 }), ...day("2026-09-09", { 7: 700, 8: 1400, 9: 2000, 10: 2500, 11: 2700, 12: 2300, 13: 800 })]
  const totals = [
    { date: "2026-09-30", revenueIncGst: 0, orders: null },
    { date: "2026-09-23", revenueIncGst: -150.5, orders: null },
    { date: "2026-09-02", revenueIncGst: 12763, orders: 345 },
  ]
  const out = fillMissingHourly([], ["2026-09-30", "2026-09-23", "2026-09-02", "2026-08-26"], totals, shape)
  assert.equal(out.filter((r) => r.date === "2026-09-30").length, 0)
  assert.equal(out.filter((r) => r.date === "2026-09-23").length, 0)
  assert.equal(out.filter((r) => r.date === "2026-08-26").length, 0)
  const est = out.filter((r) => r.date === "2026-09-02")
  assert.equal(est.length, 7)
  assert.deepEqual(est.map((r) => r.hour), [7, 8, 9, 10, 11, 12, 13])
  assert.ok(est.every((r) => r.source === "ESTIMATE" && r.orders === 0 && r.revenueIncGst > 0))
  // the estimate adds back up to the day's total (cent rounding per hour only)
  const sum = est.reduce((s, r) => s + r.revenueIncGst, 0)
  assert.ok(Math.abs(sum - 12763) < 0.05, `sum ${sum}`)
  // and the hour shares follow the shape, not a flat split
  assert.ok(est.find((r) => r.hour === 11)!.revenueIncGst > est.find((r) => r.hour === 7)!.revenueIncGst * 3)
  const c = compareHourly(out, ["2026-09-30", "2026-09-23", "2026-09-02", "2026-08-26"], null)
  assert.equal(c.daysUsed, 1); assert.equal(c.estimated, true)
  assert.ok(Math.abs((c.avgDay ?? 0) - 12763) < 0.05)
})

test("fillMissingHourly: zero and refund hours in the shape are ignored, a shape day with no positive revenue does not count", () => {
  const shape = [
    ...day("2026-09-16", { 7: 0, 8: 1000, 9: -40, 10: 3000 }),
    ...day("2026-09-09", { 8: 0, 10: 0 }),
    ...day("2026-09-02", { 8: 2, 10: 2 }, "SQUARE"),
  ]
  const totals = [{ date: "2026-09-30", revenueIncGst: 2000, orders: null }]
  const out = fillMissingHourly([], ["2026-09-30"], totals, shape)
  // profile over 16 Sep (0.25 / 0.75) and 2 Sep (0.5 / 0.5) only; 9 Sep has nothing positive
  assert.deepEqual(out.map((r) => [r.hour, r.revenueIncGst]), [[8, 750], [10, 1250]])
})

test("fillMissingHourly: multiple missing days each scale to their own total and nothing is mutated", () => {
  const shape = day("2026-09-16", { 7: 1, 8: 3 })
  const rows = day("2026-09-23", { 7: 50, 8: 50 })
  const rowsCopy = structuredClone(rows)
  const totals = [
    { date: "2026-09-30", revenueIncGst: 400, orders: null },
    { date: "2026-09-09", revenueIncGst: 1000, orders: null },
    { date: "2026-09-23", revenueIncGst: 100, orders: null },
  ]
  const out = fillMissingHourly(rows, ["2026-09-30", "2026-09-23", "2026-09-09"], totals, [...shape, ...rows])
  assert.deepEqual(rows, rowsCopy)
  assert.equal(out.length, 2 + 2 + 2)
  // profile = mean of 16 Sep (0.25 / 0.75) and the real 23 Sep rows (0.5 / 0.5) = 0.375 / 0.625
  assert.deepEqual(out.filter((r) => r.date === "2026-09-30").map((r) => r.revenueIncGst), [150, 250])
  assert.deepEqual(out.filter((r) => r.date === "2026-09-09").map((r) => r.revenueIncGst), [375, 625])
  // 23 Sep had real rows, so they stay as-is and are not re-estimated from its total
  assert.deepEqual(out.filter((r) => r.date === "2026-09-23"), rowsCopy)
})

test("fillMissingHourly: empty dates or all dates present returns the rows unchanged", () => {
  const rows = day("2026-09-23", { 7: 50 })
  assert.equal(fillMissingHourly(rows, [], [{ date: "2026-09-23", revenueIncGst: 50, orders: null }], rows), rows)
  assert.equal(fillMissingHourly(rows, ["2026-09-23"], [], rows), rows)
})
