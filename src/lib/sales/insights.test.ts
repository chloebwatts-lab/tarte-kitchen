import { test } from "node:test"
import assert from "node:assert/strict"
import { comparisonDates, compareHourly, fillMissingHourly, headline, typicalChannels, dailySeries, brisbaneNow, currumbinTogether, type HourlyRow } from "./insights"

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

test("headline: % vs average at this time, without surcharge, on pace, vs last week (today = paid + open tables)", () => {
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

test("headline: counting open tables lifts every figure versus paid alone, and the lift is exactly the open-table money", () => {
  // Sunday 1:15pm at Tarte: $18,420.50 banked, $3,215.80 sitting on open lunch tables,
  // Sunday surcharge $1,105.23 inside the paid figure. Four-week average to now $20,100 of a $30,596 day.
  const cmp = { avgHourly: [], avgDay: 30596, avgToNow: 20100, daysUsed: 4, estimated: false }
  const lw = { avgHourly: [], avgDay: 29210, avgToNow: 19800, daysUsed: 1, estimated: false }
  const paid = 18420.5, open = 3215.8, surcharge = 1105.23
  const paidOnly = headline(paid, surcharge, cmp, lw)
  const withOpen = headline(paid + open, surcharge, cmp, lw)

  // Paid alone reads as a down day; paid + open reads as the up day it actually is.
  assert.equal(paidOnly.vsAvgPct, -8.4)
  assert.equal(withOpen.vsAvgPct, 7.6)
  assert.equal(paidOnly.vsAvgDollars, -1679.5)
  assert.equal(withOpen.vsAvgDollars, 1536.3)
  assert.equal(Math.round((withOpen.vsAvgDollars! - paidOnly.vsAvgDollars!) * 100) / 100, open)

  // Surcharge is still taken off the combined figure.
  assert.equal(withOpen.vsAvgNoSurchargePct, 2.1)

  // On pace: share to now = 20100 / 30596; projection rounds to the nearest $100.
  assert.equal(paidOnly.onPaceFor, 28000)
  assert.equal(withOpen.onPaceFor, 32900)

  // Same lift against last week.
  assert.equal(paidOnly.vsLastWeekPct, -7)
  assert.equal(withOpen.vsLastWeekPct, 9.3)
  assert.equal(paidOnly.vsLastWeekDollars, -1379.5)
  assert.equal(withOpen.vsLastWeekDollars, 1836.3)
})

test("headline: no open tables leaves the figures identical to paid alone", () => {
  const cmp = { avgHourly: [], avgDay: 30596, avgToNow: 24532, daysUsed: 4, estimated: false }
  const lw = { avgHourly: [], avgDay: 27810, avgToNow: 22452, daysUsed: 1, estimated: false }
  assert.deepEqual(headline(25036 + 0, 1192, cmp, lw), headline(25036, 1192, cmp, lw))
})

test("headline: nothing sold yet, or no comparison data, gives -100% / nulls rather than NaN", () => {
  const cmp = { avgHourly: [], avgDay: 30596, avgToNow: 20100, daysUsed: 4, estimated: false }
  const opening = headline(0, 0, cmp, cmp)
  assert.equal(opening.vsAvgPct, -100)
  assert.equal(opening.vsAvgDollars, -20100)
  assert.equal(opening.vsAvgNoSurchargePct, -100)
  assert.equal(opening.onPaceFor, 0)
  assert.equal(opening.vsLastWeekPct, -100)

  const none = { avgHourly: [], avgDay: null, avgToNow: null, daysUsed: 0, estimated: false }
  const h = headline(18420.5 + 3215.8, 1105.23, none, none)
  assert.deepEqual(h, { vsAvgPct: null, vsAvgDollars: null, vsAvgNoSurchargePct: null, onPaceFor: null, vsLastWeekPct: null, vsLastWeekDollars: null })
})

test("compareHourly: a Square day with its exact figure at this minute is not estimated; a day without one is", () => {
  const rows: HourlyRow[] = [
    { date: "2026-10-11", hour: 7, revenueIncGst: 1000, orders: 10, source: "SQUARE" },
    { date: "2026-10-11", hour: 8, revenueIncGst: 3000, orders: 30, source: "SQUARE" },
    { date: "2026-10-04", hour: 7, revenueIncGst: 800, orders: 8, source: "SQUARE" },
    { date: "2026-10-04", hour: 8, revenueIncGst: 2400, orders: 24, source: "SQUARE" },
  ]
  const at759 = 7 * 60 + 59
  // Exact for 11 Oct (Shawna's example: $1,915 paid + $489 on open tables); 4 Oct falls back to the hourly shape
  const exact = compareHourly(rows, ["2026-10-11"], at759, new Map([["2026-10-11", 2403]]))
  assert.equal(exact.avgToNow, 2403); assert.equal(exact.estimated, false); assert.equal(exact.avgDay, 4000)
  const mixed = compareHourly(rows, ["2026-10-11", "2026-10-04"], at759, new Map([["2026-10-11", 2403]]))
  assert.equal(mixed.estimated, true)
  assert.equal(mixed.avgToNow, Math.round(((2403 + 800 * 59 / 60) / 2) * 100) / 100)
  // Whole-day comparison ignores the exact map and is not estimated
  const closed = compareHourly(rows, ["2026-10-11"], null, new Map([["2026-10-11", 2403]]))
  assert.equal(closed.avgToNow, 4000); assert.equal(closed.estimated, false)
})

test("compareHourly: an exact figure of $0 is still exact (nothing sold yet that day), and an ESTIMATE-source day stays estimated even with an exact value", () => {
  const rows: HourlyRow[] = [
    { date: "2026-10-11", hour: 9, revenueIncGst: 500, orders: 5, source: "SQUARE" },
    { date: "2026-10-04", hour: 6, revenueIncGst: 300, orders: 0, source: "ESTIMATE" },
    { date: "2026-10-04", hour: 9, revenueIncGst: 700, orders: 0, source: "ESTIMATE" },
  ]
  const at630 = 6 * 60 + 30
  // 11 Oct: exactly $0 by 6:30 (opened 7am); the hourly shape would also give 0 but must not flip to estimated
  const zero = compareHourly(rows, ["2026-10-11"], at630, new Map([["2026-10-11", 0]]))
  assert.equal(zero.avgToNow, 0); assert.equal(zero.estimated, false); assert.equal(zero.daysUsed, 1)
  // 4 Oct is a Lightspeed estimate: pro rata half of the 6am hour, flagged estimated
  const ls = compareHourly(rows, ["2026-10-04"], at630)
  assert.equal(ls.avgToNow, 150); assert.equal(ls.estimated, true)
  // Even if someone passes an exact value for an ESTIMATE day it is used, but the estimate flag stays on (its hourly shape is borrowed)
  const odd = compareHourly(rows, ["2026-10-04"], at630, new Map([["2026-10-04", 120]]))
  assert.equal(odd.avgToNow, 120); assert.equal(odd.estimated, true)
  // A date with an exact value but no hourly rows at all is not used
  const none = compareHourly(rows, ["2026-09-27"], at630, new Map([["2026-09-27", 999]]))
  assert.equal(none.avgToNow, null); assert.equal(none.daysUsed, 0); assert.equal(none.estimated, false)
})

test("compareHourly: at midnight AEST (nowMinutes 0) a Square day with its orders reads exact zero and a Square day without them is estimated", () => {
  const rows: HourlyRow[] = [{ date: "2026-10-11", hour: 7, revenueIncGst: 1000, orders: 10, source: "SQUARE" }]
  assert.deepEqual([compareHourly(rows, ["2026-10-11"], 0, new Map([["2026-10-11", 0]])).avgToNow, compareHourly(rows, ["2026-10-11"], 0, new Map([["2026-10-11", 0]])).estimated], [0, false])
  const noRows = compareHourly(rows, ["2026-10-11"], 0)
  assert.equal(noRows.avgToNow, 0); assert.equal(noRows.estimated, true)
})

test("currumbinTogether: Beach House + Tea Garden paid and open, the Square All locations figure", () => {
  // Sat 24 Oct 2026 noon: card $12,229 Beach House, Square $13.2k on All locations.
  const bh = { paidIncGst: 10680.72, openTablesIncGst: 1548.4 }
  const tg = { paidIncGst: 412.9, openTablesIncGst: 576.3 }
  assert.deepEqual(currumbinTogether(bh, tg), { total: 13218.32, paid: 11093.62, open: 2124.7 })
  // Same answer from either venue's card.
  assert.deepEqual(currumbinTogether(tg, bh), currumbinTogether(bh, tg))
})

test("currumbinTogether: nothing at the other venue (Tea Garden shut Mon/Tue, or no data) gives null", () => {
  const bh = { paidIncGst: 9677.45, openTablesIncGst: 0 }
  assert.equal(currumbinTogether(bh, null), null)
  assert.equal(currumbinTogether(bh, { paidIncGst: 0, openTablesIncGst: 0 }), null)
  // Only open tables at the other venue still counts.
  assert.deepEqual(currumbinTogether(bh, { paidIncGst: 0, openTablesIncGst: 120 }), { total: 9797.45, paid: 9677.45, open: 120 })
})

test("currumbinTogether: a Tea Garden refund nets off, and sums land on whole cents", () => {
  // paidIncGst is already net of refunds, so it can dip below zero on a quiet morning.
  const bh = { paidIncGst: 3104.1, openTablesIncGst: 0.2 }
  const tg = { paidIncGst: -26.9, openTablesIncGst: 53.8 }
  assert.deepEqual(currumbinTogether(bh, tg), { total: 3131.2, paid: 3077.2, open: 54 })
  // Float noise (0.1 + 0.2) never leaks past the cent.
  const r = currumbinTogether({ paidIncGst: 0.1, openTablesIncGst: 0 }, { paidIncGst: 0.2, openTablesIncGst: 0 })
  assert.deepEqual(r, { total: 0.3, paid: 0.3, open: 0 })
  // A refund-only day at the other venue still comes off, as on Square.
  assert.deepEqual(currumbinTogether({ paidIncGst: 500, openTablesIncGst: 0 }, { paidIncGst: -19, openTablesIncGst: 0 }), { total: 481, paid: 481, open: 0 })
})
