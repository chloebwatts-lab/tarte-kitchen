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

// ─── test-guard additions, 18 Nov 2026 ───────────────────────────────

const ch = (date: string, channel: string, incGst: number, venue = "BEACH_HOUSE"): ChannelIn => ({ date, venue, channel, incGst })

test("Tuesday, the last day of the trading week: six finished days Wed to Mon, last week is the Wed to Tue before", () => {
  const s = buildCurrumbinSales(
    [
      sum("2026-11-18", "BEACH_HOUSE", 4000), // Wed
      sum("2026-11-21", "BEACH_HOUSE", 7000), // Sat
      sum("2026-11-23", "BEACH_HOUSE", 3000), // Mon
      sum("2026-11-24", "BEACH_HOUSE", 1500), // Tue, today, left out of the week
      sum("2026-11-11", "BEACH_HOUSE", 4000), // last Wed
      sum("2026-11-16", "BEACH_HOUSE", 2000), // last Mon
      sum("2026-11-17", "BEACH_HOUSE", 2500), // last Tue: in last week's total, not in the same-days figure
      sum("2026-11-10", "BEACH_HOUSE", 99999), // the Tue before that: a different trading week
    ],
    [],
    "2026-11-24",
  )
  assert.equal(s.weekDone, 14000)
  assert.equal(s.weekDoneDays, 3)
  assert.equal(s.lastWeekSameDays, 6000)
  assert.equal(s.weekVsLastWeekPct, 133.3)
  assert.equal(s.lastWeekTotal, 4000 + 2000 + 2500)
  assert.equal(s.sameDayLastWeek, 2500)
})

test("New Year: Fri 1 Jan 2027 reads a week that started Wed 30 Dec 2026", () => {
  const s = buildCurrumbinSales(
    [
      sum("2026-12-30", "BEACH_HOUSE", 5000),
      sum("2026-12-31", "BEACH_HOUSE", 6000),
      sum("2026-12-31", "TEA_GARDEN", 900),
      sum("2026-12-23", "BEACH_HOUSE", 4000),
      sum("2026-12-24", "BEACH_HOUSE", 4000),
      sum("2026-12-25", "BEACH_HOUSE", 0.5), // Christmas Day stray sale, outside the same-days window
    ],
    [],
    "2027-01-01",
  )
  assert.equal(s.days[0].date, "2027-01-01")
  assert.equal(s.days[1].date, "2026-12-31")
  assert.equal(s.days[13].date, "2026-12-19")
  assert.equal(s.weekDone, 11900)
  assert.equal(s.weekDoneDays, 2)
  assert.equal(s.lastWeekSameDays, 8000)
  assert.equal(s.weekVsLastWeekPct, 48.8)
  assert.equal(s.days[1].vsLastWeekPct, 72.5) // 6900 against 4000
})

test("cents from Square are summed before rounding to whole dollars", () => {
  const s = buildCurrumbinSales([sum("2026-11-19", "BEACH_HOUSE", 2393.45), sum("2026-11-19", "TEA_GARDEN", 612.3), sum("2026-11-12", "BEACH_HOUSE", 3005.74)], [], "2026-11-20")
  const thu = s.days[1]
  assert.equal(thu.beachHouse, 2393)
  assert.equal(thu.teaGarden, 612)
  assert.equal(thu.total, 3006)
  assert.equal(thu.lastWeek, 3006)
  assert.equal(thu.vsLastWeekPct, 0)
})

test("a refund-only day is negative, not absent, and a negative week before gives no %", () => {
  const s = buildCurrumbinSales(
    [sum("2026-11-19", "TEA_GARDEN", -40, 0), sum("2026-11-12", "TEA_GARDEN", 500), sum("2026-11-18", "TEA_GARDEN", 300), sum("2026-11-11", "TEA_GARDEN", -25, 0)],
    [ch("2026-11-19", "CAFE", -44, "TEA_GARDEN")],
    "2026-11-20",
  )
  assert.equal(s.days[1].total, -40)
  assert.equal(s.days[1].teaGarden, -40)
  assert.equal(s.days[1].beachHouse, null)
  assert.equal(s.days[1].orders, 0)
  assert.equal(s.days[1].vsLastWeekPct, -108)
  assert.equal(s.days[2].vsLastWeekPct, null) // last Wed was -$25: no baseline
  assert.deepEqual(s.splits, []) // channels net negative: no split rather than a nonsense one
})

test("a day with nothing the week before gets no %, and a new day with no row is not a 100% drop", () => {
  const s = buildCurrumbinSales([sum("2026-11-19", "BEACH_HOUSE", 8000), sum("2026-11-11", "BEACH_HOUSE", 9000)], [], "2026-11-20")
  assert.equal(s.days[1].lastWeek, null)
  assert.equal(s.days[1].vsLastWeekPct, null)
  assert.equal(s.days[2].total, null) // Wed 18 Nov not synced
  assert.equal(s.days[2].lastWeek, 9000)
  assert.equal(s.days[2].vsLastWeekPct, null)
})

test("orders: null from Square stays null, one venue's count is kept when the other has none", () => {
  const s = buildCurrumbinSales(
    [sum("2026-11-20", "BEACH_HOUSE", 1000, null), sum("2026-11-20", "TEA_GARDEN", 200, null), sum("2026-11-19", "BEACH_HOUSE", 1000, 84), sum("2026-11-19", "TEA_GARDEN", 200, null)],
    [],
    "2026-11-20",
  )
  assert.equal(s.todayOrders, null)
  assert.equal(s.days[1].orders, 84)
})

test("first thing in the morning: nothing synced today, so today is empty and only yesterday's split shows", () => {
  const s = buildCurrumbinSales([sum("2026-11-19", "BEACH_HOUSE", 2000), sum("2026-11-13", "BEACH_HOUSE", 2500)], [ch("2026-11-19", "CAFE", 2200)], "2026-11-20")
  assert.equal(s.todaySoFar, null)
  assert.equal(s.todayOrders, null)
  assert.equal(s.sameDayLastWeek, 2500)
  assert.equal(s.days[0].vsLastWeekPct, null)
  assert.equal(s.splits.length, 1)
  assert.equal(s.splits[0].date, "2026-11-19")
  assert.equal(s.splits[0].isToday, false)
  assert.deepEqual(s.splits[0].lines, [{ label: "Beach House cafe", amount: 2000 }])
})

test("channel names: unknown ones fold into Beach House other, Tea Garden is one line, a net-zero channel is dropped", () => {
  const s = buildCurrumbinSales(
    [sum("2026-11-20", "BEACH_HOUSE", 1000), sum("2026-11-20", "TEA_GARDEN", 100)],
    [ch("2026-11-20", "CAFE", 880), ch("2026-11-20", "UBER", 110), ch("2026-11-20", "OTHER", 110), ch("2026-11-20", "RESTAURANT", 0), ch("2026-11-20", "CAFE", 66, "TEA_GARDEN"), ch("2026-11-20", "ONLINE", 44, "TEA_GARDEN")],
    "2026-11-20",
  )
  const lines = s.splits[0].lines
  assert.deepEqual(lines.map((l) => l.label), ["Beach House cafe", "Beach House other", "Tea Garden"])
  assert.deepEqual(lines.map((l) => l.amount), [800, 200, 100])
})

test("Burleigh channel rows alone never make a Currumbin split", () => {
  const s = buildCurrumbinSales([sum("2026-11-20", "BEACH_HOUSE", 1000)], [ch("2026-11-20", "CAFE", 5000, "BURLEIGH")], "2026-11-20")
  assert.deepEqual(s.splits, [])
})

test(
  "split keeps Tea Garden money out of Beach House lines when Tea Garden's channel rows are missing",
  { todo: "known gap: channels are scaled to the combined total, so a venue with a summary but no channel rows (breakdown failed or mid-sync) lands in the other venue's lines" },
  () => {
    const s = buildCurrumbinSales([sum("2026-11-20", "BEACH_HOUSE", 1000), sum("2026-11-20", "TEA_GARDEN", 1000)], [ch("2026-11-20", "CAFE", 1100)], "2026-11-20")
    const cafe = s.splits[0]?.lines.find((l) => l.label === "Beach House cafe")
    assert.equal(cafe?.amount, 1000)
  },
)
