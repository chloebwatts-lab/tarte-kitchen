import { test } from "node:test"
import assert from "node:assert/strict"
import { allRevenueByDay } from "./all-revenue"

const TODAY = "2026-11-12"

test("all revenue = tills + Uber ex GST + events, per venue and day", () => {
  const rows = allRevenueByDay(
    [
      { date: "2026-11-10", venue: "BEACH_HOUSE", exGst: 9000, incGst: 9900 },
      { date: "2026-11-10", venue: "TEA_GARDEN", exGst: 1000, incGst: 1100 },
    ],
    [{ date: "2026-11-10", venue: "BEACH_HOUSE", salesIncGst: 1100 }],
    [
      { date: "2026-11-10", venue: "BEACH_HOUSE", exGst: 2000 },
      { date: "2026-11-10", venue: "TEA_GARDEN", exGst: 500 },
    ],
    TODAY,
  )
  assert.deepEqual(rows, [
    { date: "2026-11-10", venue: "BEACH_HOUSE", posExGst: 9000, posIncGst: 9900, uberExGst: 1000, uberIncGst: 1100, eventsExGst: 2000, totalExGst: 12000, posMissing: false },
    { date: "2026-11-10", venue: "TEA_GARDEN", posExGst: 1000, posIncGst: 1100, uberExGst: 0, uberIncGst: 0, eventsExGst: 500, totalExGst: 1500, posMissing: false },
  ])
})

test("a day whose tills can still report stays missing; a past closed day keeps its event", () => {
  const rows = allRevenueByDay(
    [],
    [{ date: TODAY, venue: "BEACH_HOUSE", salesIncGst: 550 }],
    [
      { date: TODAY, venue: "BEACH_HOUSE", exGst: 1800 },
      { date: "2026-11-09", venue: "TEA_GARDEN", exGst: 2400 },
    ],
    TODAY,
  )
  assert.deepEqual(rows, [
    { date: "2026-11-09", venue: "TEA_GARDEN", posExGst: 0, posIncGst: 0, uberExGst: 0, uberIncGst: 0, eventsExGst: 2400, totalExGst: 2400, posMissing: true },
  ])
})

test("Uber with no till row is still left out (the 22 Oct rule), and duplicates are summed once", () => {
  const rows = allRevenueByDay(
    [{ date: "2026-11-08", venue: "BURLEIGH", exGst: 5000 }, { date: "2026-11-08", venue: "BURLEIGH", exGst: 5000 }],
    [{ date: "2026-11-07", venue: "BURLEIGH", salesIncGst: 330 }],
    [],
    TODAY,
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].totalExGst, 5000)
})
