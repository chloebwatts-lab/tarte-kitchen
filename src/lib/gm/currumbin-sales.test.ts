import { test } from "node:test"
import assert from "node:assert/strict"
import { buildCurrumbinSales, type ChannelIn, type SummaryIn } from "./currumbin-sales"

// Wed 18 Nov 2026 is the first day of a trading week; Fri 20 Nov is day 3.
const sum = (date: string, venue: string, exGst: number, orders: number | null = 10): SummaryIn => ({ date, venue, exGst, orders })

test("adds Beach House and Tea Garden, ignores Burleigh, and leaves a closed day absent", () => {
  const s = buildCurrumbinSales(
    [
      sum("2026-11-20", "BEACH_HOUSE", 2000, 100),
      sum("2026-11-20", "TEA_GARDEN", 500, 20),
      sum("2026-11-20", "BURLEIGH", 9999, 999),
      sum("2026-11-19", "BEACH_HOUSE", 8000),
    ],
    [],
    "2026-11-20",
  )
  assert.equal(s.todaySoFar, 2500)
  assert.equal(s.todayOrders, 120)
  assert.equal(s.days[0].isToday, true)
  assert.equal(s.days[1].teaGarden, null) // Tea Garden closed Thursday: absent, not $0
  assert.equal(s.days[1].total, 8000)
  assert.equal(s.days[2].total, null) // nothing at all on Wednesday
  assert.equal(s.days.length, 14)
})

test("today gets no % against last week (still trading); finished days do", () => {
  const s = buildCurrumbinSales(
    [sum("2026-11-20", "BEACH_HOUSE", 1000), sum("2026-11-13", "BEACH_HOUSE", 10000), sum("2026-11-19", "BEACH_HOUSE", 11000), sum("2026-11-12", "BEACH_HOUSE", 10000)],
    [],
    "2026-11-20",
  )
  assert.equal(s.days[0].lastWeek, 10000)
  assert.equal(s.days[0].vsLastWeekPct, null)
  assert.equal(s.sameDayLastWeek, 10000)
  assert.equal(s.days[1].vsLastWeekPct, 10)
})

test("week so far counts finished days from Wednesday only, against the same days last week", () => {
  const s = buildCurrumbinSales(
    [
      sum("2026-11-18", "BEACH_HOUSE", 10000), // Wed
      sum("2026-11-19", "BEACH_HOUSE", 12000), // Thu
      sum("2026-11-20", "BEACH_HOUSE", 3000), // Fri, today, left out
      sum("2026-11-17", "BEACH_HOUSE", 9000), // Tue, last week
      sum("2026-11-11", "BEACH_HOUSE", 10000), // last Wed
      sum("2026-11-12", "BEACH_HOUSE", 10000), // last Thu
      sum("2026-11-13", "BEACH_HOUSE", 20000), // last Fri, not a finished day this week yet
    ],
    [],
    "2026-11-20",
  )
  assert.equal(s.weekDone, 22000)
  assert.equal(s.weekDoneDays, 2)
  assert.equal(s.lastWeekSameDays, 20000)
  assert.equal(s.weekVsLastWeekPct, 10)
  assert.equal(s.lastWeekTotal, 10000 + 10000 + 20000 + 9000)
})

test("on a Wednesday there are no finished days yet, so no week %", () => {
  const s = buildCurrumbinSales([sum("2026-11-18", "BEACH_HOUSE", 500), sum("2026-11-11", "BEACH_HOUSE", 9000)], [], "2026-11-18")
  assert.equal(s.weekDoneDays, 0)
  assert.equal(s.weekDone, 0)
  assert.equal(s.lastWeekSameDays, null)
  assert.equal(s.weekVsLastWeekPct, null)
  assert.equal(s.lastWeekTotal, 9000)
})

test("channel split is scaled from inc GST to the ex GST total and adds up", () => {
  const ch = (channel: string, incGst: number, venue = "BEACH_HOUSE"): ChannelIn => ({ date: "2026-11-18", venue, channel, incGst })
  const s = buildCurrumbinSales(
    [sum("2026-11-18", "BEACH_HOUSE", 2393), sum("2026-11-18", "TEA_GARDEN", 100)],
    [ch("CAFE", 1695.1), ch("ONLINE", 271.7), ch("RESTAURANT", 635.5), ch("CAFE", 110, "TEA_GARDEN"), ch("CAFE", 50, "BURLEIGH")],
    "2026-11-18",
  )
  assert.equal(s.splits.length, 1)
  const split = s.splits[0]
  assert.equal(split.isToday, true)
  assert.deepEqual(split.lines.map((l) => l.label), ["Beach House cafe", "Beach House restaurant", "Beach House online", "Tea Garden"])
  const added = split.lines.reduce((a, l) => a + l.amount, 0)
  assert.ok(Math.abs(added - 2493) <= 2, `split adds to ${added}`)
  assert.ok(split.lines[0].amount > split.lines[1].amount)
})

test("no channel rows means no split, not a split of zeros", () => {
  const s = buildCurrumbinSales([sum("2026-11-18", "BEACH_HOUSE", 2000)], [], "2026-11-18")
  assert.deepEqual(s.splits, [])
})
