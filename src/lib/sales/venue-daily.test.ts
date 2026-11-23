import { test } from "node:test"
import assert from "node:assert/strict"
import { buildVenueDaily, type VenueDayIn } from "./venue-daily"
import { BURLEIGH_SALES_STAFF, isBurleighSalesPerson, parseBurleighSalesList } from "./burleigh-sales-access"

// Wed 18 Nov 2026 starts a trading week; Mon 23 Nov is day 6.
const row = (date: string, exGst: number, orders: number | null = 10): VenueDayIn => ({ date, exGst, orders })

test("today so far, same weekday last week, and a day with no sales is absent not $0", () => {
  const s = buildVenueDaily([row("2026-11-23", 13806.4, 456), row("2026-11-16", 20000, 600), row("2026-11-21", 23139)], "2026-11-23")
  assert.equal(s.todaySoFar, 13806)
  assert.equal(s.todayOrders, 456)
  assert.equal(s.sameDayLastWeek, 20000)
  assert.equal(s.days.length, 14)
  assert.equal(s.days[0].isToday, true)
  assert.equal(s.days[0].vsLastWeekPct, null) // today is still trading
  assert.equal(s.days[1].total, null) // Sun 22 Nov: no row, so absent
  assert.equal(s.days[2].total, 23139)
})

test("this week's finished days against the same days last week, and last week Wed to Tue", () => {
  const rows: VenueDayIn[] = []
  for (const d of ["2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]) rows.push(row(d, 1100))
  for (const d of ["2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]) rows.push(row(d, 1000))
  rows.push(row("2026-11-23", 500)) // today, not in the week so far
  const s = buildVenueDaily(rows, "2026-11-23")
  assert.equal(s.weekDoneDays, 5)
  assert.equal(s.weekDone, 5500)
  assert.equal(s.lastWeekSameDays, 5000)
  assert.equal(Math.round(s.weekVsLastWeekPct!), 10)
  assert.equal(s.lastWeekTotal, 7000)
})

test("on a Wednesday the week has no finished days yet", () => {
  const s = buildVenueDaily([row("2026-11-18", 900), row("2026-11-17", 1000)], "2026-11-18")
  assert.equal(s.weekDoneDays, 0)
  assert.equal(s.weekVsLastWeekPct, null)
  assert.equal(s.lastWeekTotal, 1000)
})

test("Burleigh sales grant: Vinicius in code, others only from the list, broken list adds nobody", () => {
  assert.ok(BURLEIGH_SALES_STAFF.includes("Vinicius Sequeira"))
  assert.equal(isBurleighSalesPerson(null, { id: "cmrlcnxw0000bq1s8pgc8n2ej", name: "Someone Renamed" }), true)
  assert.equal(isBurleighSalesPerson(null, { id: "x", name: "Vinicius Sequeira" }), true)
  assert.equal(isBurleighSalesPerson(null, { id: "x", name: "Vinicius Almeida" }), false) // full name only, not first name
  assert.equal(isBurleighSalesPerson(null, { id: "x", name: "Kiho Moriwaka" }), false)
  assert.equal(isBurleighSalesPerson('["Georgia Farquhar"]', { id: "x", name: "Georgia Farquhar" }), true)
  assert.equal(isBurleighSalesPerson("not json", { id: "x", name: "Georgia Farquhar" }), false)
  assert.deepEqual(parseBurleighSalesList('[1, 2]'), [])
  assert.equal(isBurleighSalesPerson(null, null), false)
})
