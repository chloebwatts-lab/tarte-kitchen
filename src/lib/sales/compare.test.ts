import { test } from "node:test"
import assert from "node:assert/strict"
import { compareSales, tarteWeekStart, shiftDate, pctChange, fmtPctChange, weekdayShort, type DayRevenue } from "./compare"

test("tarteWeekStart: Wed anchors, Tue belongs to the week that started 6 days earlier", () => {
  assert.equal(tarteWeekStart("2026-10-01"), "2026-09-30") // Thu -> Wed
  assert.equal(tarteWeekStart("2026-09-30"), "2026-09-30") // Wed itself
  assert.equal(tarteWeekStart("2026-10-06"), "2026-09-30") // Tue -> previous Wed
  assert.equal(tarteWeekStart("2026-10-07"), "2026-10-07") // next Wed
  assert.equal(shiftDate("2026-10-01", -7), "2026-09-24")
})

function rows(from: string, days: number, value: (d: string) => number | null): DayRevenue[] {
  const out: DayRevenue[] = []
  for (let i = 0; i < days; i++) {
    const d = shiftDate(from, i)
    const v = value(d)
    if (v !== null) out.push({ date: d, revenueExGst: v })
  }
  return out
}

test("today vs same weekday last week and 4-week average, week to date vs last week", () => {
  // 6 weeks of flat $1000 days, except today (Thu 1 Oct) $1200 and last Thu $1000.
  const data = rows("2026-08-20", 43, (d) => (d === "2026-10-01" ? 1200 : 1000))
  const c = compareSales(data, "2026-10-01")
  assert.equal(c.today, 1200)
  assert.equal(c.sameDayLastWeek, 1000)
  assert.equal(c.fourWeekAvgSameDay, 1000)
  assert.equal(c.todayVsLastWeekPct, 20)
  assert.equal(c.todayVsFourWeekPct, 20)
  // Wed 30 Sep ($1000) + Thu 1 Oct ($1200)
  assert.equal(c.weekToDate, 2200)
  assert.equal(c.lastWeekSameDays, 2000)
  assert.equal(c.weekToDateVsLastWeekPct, 10)
  assert.equal(c.lastWeekTotal, 7000)
})

test("closed days are absent, not zero: the 4-week average ignores them", () => {
  // Tea Garden closed on two of the last four Thursdays.
  const data: DayRevenue[] = [
    { date: "2026-10-01", revenueExGst: 800 },
    { date: "2026-09-24", revenueExGst: 700 },
    { date: "2026-09-10", revenueExGst: 900 },
  ]
  const c = compareSales(data, "2026-10-01")
  assert.equal(c.fourWeekAvgSameDay, 800) // (700 + 900) / 2
  assert.equal(c.sameDayLastWeek, 700)
  assert.equal(c.todayVsLastWeekPct, 14.3)
})

test("no history at all gives nulls, never NaN or division errors", () => {
  const c = compareSales([{ date: "2026-10-01", revenueExGst: 500 }], "2026-10-01")
  assert.equal(c.sameDayLastWeek, null)
  assert.equal(c.fourWeekAvgSameDay, null)
  assert.equal(c.todayVsLastWeekPct, null)
  assert.equal(c.todayVsFourWeekPct, null)
  assert.equal(c.lastWeekSameDays, null)
  assert.equal(c.weekToDateVsLastWeekPct, null)
  assert.equal(c.lastWeekTotal, null)
  assert.equal(c.today, 500)
  assert.equal(c.weekToDate, 500)
})

test("no row for today reads as $0 today but still compares against history", () => {
  const data = rows("2026-09-01", 30, () => 1000)
  const c = compareSales(data, "2026-10-01")
  assert.equal(c.today, 0)
  assert.equal(c.sameDayLastWeek, 1000)
  assert.equal(c.todayVsLastWeekPct, -100)
})

test("same date twice (two venues merged) is summed", () => {
  const c = compareSales(
    [
      { date: "2026-10-01", revenueExGst: 100 },
      { date: "2026-10-01", revenueExGst: 50 },
      { date: "2026-09-24", revenueExGst: 100 },
    ],
    "2026-10-01"
  )
  assert.equal(c.today, 150)
  assert.equal(c.todayVsLastWeekPct, 50)
})

test("pctChange and formatting", () => {
  assert.equal(pctChange(110, 100), 10)
  assert.equal(pctChange(90, 100), -10)
  assert.equal(pctChange(5, 0), null)
  assert.equal(pctChange(5, null), null)
  assert.equal(fmtPctChange(12.4), "+12%")
  assert.equal(fmtPctChange(-3.6), "-4%")
  assert.equal(fmtPctChange(0), "0%")
  assert.equal(fmtPctChange(null), "")
  assert.equal(weekdayShort("2026-10-01"), "Thu")
})
