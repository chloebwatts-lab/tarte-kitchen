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

// Edges added by the pre-push guard (12 Nov 2026).
import { brisbaneNow } from "./insights"

test("no Uber and no events: the tills pass through untouched (labour-live and the feed see the same numbers as before)", () => {
  const pos = [
    { date: "2026-11-11", venue: "BURLEIGH", exGst: 9842.37, incGst: 10826.61 },
    { date: "2026-11-11", venue: "BEACH_HOUSE", exGst: 4525.39, incGst: 4977.93 },
    // Today's running total from the 30 minute sync.
    { date: TODAY, venue: "BEACH_HOUSE", exGst: 3127.27 },
    // A refund-heavy day can read negative on the tills; it is not clamped.
    { date: "2026-11-10", venue: "TEA_GARDEN", exGst: -26.9, incGst: -29.59 },
  ]
  const rows = allRevenueByDay(pos, [], [], TODAY)
  assert.equal(rows.length, pos.length)
  for (const p of pos) {
    const r = rows.find((x) => x.date === p.date && x.venue === p.venue)
    assert.ok(r, `${p.date} ${p.venue} kept`)
    assert.equal(r.posExGst, p.exGst)
    assert.equal(r.posIncGst, p.incGst ?? 0)
    assert.equal(r.totalExGst, p.exGst)
    assert.equal(r.uberExGst, 0)
    assert.equal(r.eventsExGst, 0)
    assert.equal(r.posMissing, false)
  }
  // Oldest first, then venue, whatever order the rows arrived in.
  assert.deepEqual(rows.map((r) => `${r.date} ${r.venue}`), [
    "2026-11-10 TEA_GARDEN",
    "2026-11-11 BEACH_HOUSE",
    "2026-11-11 BURLEIGH",
    `${TODAY} BEACH_HOUSE`,
  ])
  assert.deepEqual(allRevenueByDay([], [], [], TODAY), [])
})

test("today with a till row carries today's Uber and today's event; today without one waits for the tills", () => {
  const rows = allRevenueByDay(
    [{ date: TODAY, venue: "BEACH_HOUSE", exGst: 3127.27, incGst: 3440 }],
    [
      { date: TODAY, venue: "BEACH_HOUSE", salesIncGst: 26.9 },
      { date: TODAY, venue: "BURLEIGH", salesIncGst: 80.7 },
    ],
    [
      { date: TODAY, venue: "BEACH_HOUSE", exGst: 1800 },
      { date: TODAY, venue: "BURLEIGH", exGst: 950 },
    ],
    TODAY,
  )
  assert.deepEqual(rows, [
    // $26.90 inc GST on Uber is $24.45 ex.
    { date: TODAY, venue: "BEACH_HOUSE", posExGst: 3127.27, posIncGst: 3440, uberExGst: 24.45, uberIncGst: 26.9, eventsExGst: 1800, totalExGst: 4951.72, posMissing: false },
  ])
})

test("AEST midnight: just after 00:00 Brisbane, yesterday's private hire on a closed day counts and today's still waits", () => {
  // 14:30 UTC on Wed 11 Nov is 00:30 Thu 12 Nov in Brisbane.
  const justAfter = brisbaneNow(new Date("2026-11-11T14:30:00Z")).date
  assert.equal(justAfter, "2026-11-12")
  const events = [
    { date: "2026-11-11", venue: "TEA_GARDEN", exGst: 2400 },
    { date: "2026-11-12", venue: "TEA_GARDEN", exGst: 1500 },
  ]
  assert.deepEqual(
    allRevenueByDay([], [], events, justAfter).map((r) => [r.date, r.totalExGst, r.posMissing]),
    [["2026-11-11", 2400, true]],
  )
  // A minute before Brisbane midnight it is still the 11th, so nothing counts yet.
  const justBefore = brisbaneNow(new Date("2026-11-11T13:59:00Z")).date
  assert.equal(justBefore, "2026-11-11")
  assert.deepEqual(allRevenueByDay([], [], events, justBefore), [])
})

test("cents: Uber and event amounts are summed per day and rounded to the cent, never float noise", () => {
  const rows = allRevenueByDay(
    [{ date: "2026-11-08", venue: "BURLEIGH", exGst: 0.1 }],
    [
      { date: "2026-11-08", venue: "BURLEIGH", salesIncGst: 0.1 },
      { date: "2026-11-08", venue: "BURLEIGH", salesIncGst: 0.2 },
    ],
    [
      { date: "2026-11-08", venue: "BURLEIGH", exGst: 0.1 },
      { date: "2026-11-08", venue: "BURLEIGH", exGst: 0.2 },
      // Two event rows on a past closed day: one row, summed once.
      { date: "2026-11-09", venue: "TEA_GARDEN", exGst: 1200.1 },
      { date: "2026-11-09", venue: "TEA_GARDEN", exGst: 1199.9 },
    ],
    TODAY,
  )
  assert.deepEqual(
    rows.map((r) => [r.date, r.venue, r.uberIncGst, r.uberExGst, r.eventsExGst, r.totalExGst]),
    [
      ["2026-11-08", "BURLEIGH", 0.3, 0.27, 0.3, 0.67],
      ["2026-11-09", "TEA_GARDEN", 0, 0, 2400, 2400],
    ],
  )
})
