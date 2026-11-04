import { test } from "node:test"
import assert from "node:assert/strict"
import { aestDateOf, aestDayRange, isPaidOrder, mergeDayOrders, type SquareOrder } from "./client"
import { completionBlocker } from "./complete-online"

const m = (d: number) => ({ amount: Math.round(d * 100), currency: "AUD" })
const bopple = (id: string, created: string, over: Partial<SquareOrder> = {}): SquareOrder => ({
  id,
  state: "COMPLETED",
  source: { name: "Bopple" },
  created_at: created,
  total_money: m(20),
  net_amount_due_money: m(0),
  tenders: [{ type: "OTHER", amount_money: m(20), other_details: { source: "BOPPLE", status: "CAPTURED" } }],
  ...over,
})

/** The merge exactly as fetchDayOrders did it before the Bopple guard (e62f486^). */
function oldMerge(completed: SquareOrder[], open: SquareOrder[]) {
  const seen = new Set(completed.map((o) => o.id))
  const sales = [...completed]
  const openUnpaid: SquareOrder[] = []
  for (const o of open) {
    if (seen.has(o.id)) continue
    if (isPaidOrder(o)) sales.push(o)
    else openUnpaid.push(o)
  }
  return { sales, openUnpaid }
}

test("mergeDayOrders gives the old result for every non-Bopple order, on any day", () => {
  const completed: SquareOrder[] = [
    { id: "c1", state: "COMPLETED", source: { name: "Point of Sale" }, created_at: "2026-10-20T01:00:00Z", closed_at: "2026-11-04T02:00:00Z", total_money: m(26.9) },
    { id: "c2", state: "COMPLETED", source: { name: "Square Online" }, created_at: "2026-11-04T03:00:00Z", closed_at: "2026-11-04T03:10:00Z", total_money: m(48.3) },
    { id: "c3", state: "COMPLETED", created_at: "2026-11-03T13:59:59Z", closed_at: "2026-11-04T01:00:00Z", total_money: m(12) },
    { id: "c4", state: "COMPLETED", source: { name: "Uber Eats" }, closed_at: "2026-11-04T05:00:00Z", total_money: m(31) }, // no created_at
    { id: "c5", state: "COMPLETED", source: { name: "Point of Sale" }, created_at: "2026-11-04T06:00:00Z", closed_at: "2026-11-04T06:30:00Z", total_money: m(-15), return_amounts: { total_money: m(15) } },
  ]
  const open: SquareOrder[] = [
    { id: "o1", state: "OPEN", source: { name: "Point of Sale" }, created_at: "2026-11-04T07:00:00Z", total_money: m(26.9), tenders: [{ type: "CARD", amount_money: m(26.9) }], net_amount_due_money: m(0) }, // paid
    { id: "o2", state: "OPEN", created_at: "2026-11-04T08:00:00Z", total_money: m(180), tenders: [{ type: "CARD", amount_money: m(60) }], net_amount_due_money: m(120) }, // part paid table
    { id: "o3", state: "OPEN", created_at: "2026-11-04T09:00:00Z", total_money: m(50) }, // nothing paid
    { id: "o4", state: "OPEN", created_at: "2026-11-04T09:30:00Z", total_money: m(0) }, // zero total
    { id: "c2", state: "OPEN", created_at: "2026-11-04T03:00:00Z", total_money: m(48.3) }, // same id as a completed one
  ]
  for (const day of ["2026-11-03", "2026-11-04", "2026-11-05", "2026-10-20"]) {
    const now = mergeDayOrders(day, completed, open)
    const old = oldMerge(completed, open)
    assert.deepEqual(now.sales.map((o) => o.id), old.sales.map((o) => o.id), `sales on ${day}`)
    assert.deepEqual(now.openUnpaid.map((o) => o.id), old.openUnpaid.map((o) => o.id), `open unpaid on ${day}`)
  }
  // Spell it out once so a failure here reads plainly.
  const r = mergeDayOrders("2026-11-04", completed, open)
  assert.deepEqual(r.sales.map((o) => o.id), ["c1", "c2", "c3", "c4", "c5", "o1"])
  assert.deepEqual(r.openUnpaid.map((o) => o.id), ["o2", "o3", "o4"])
})

test("mergeDayOrders: a Bopple order with no created time keeps the old behaviour (counted on the day it closed)", () => {
  const r = mergeDayOrders("2026-11-04", [bopple("x", "", { created_at: undefined })], [])
  assert.deepEqual(r.sales.map((o) => o.id), ["x"])
})

test("mergeDayOrders: an order seen both open and completed (search race) counts once, as completed", () => {
  const done = bopple("race", "2026-11-04T02:00:00Z")
  const stillOpen = bopple("race", "2026-11-04T02:00:00Z", { state: "OPEN" })
  const r = mergeDayOrders("2026-11-04", [], [stillOpen], [done])
  assert.equal(r.sales.length, 1)
  assert.equal(r.sales[0].state, "COMPLETED")
  assert.equal(r.openUnpaid.length, 0)
})

test("mergeDayOrders: an open Bopple order paid in full counts today, an unpaid one stays an open bill", () => {
  const paid = bopple("p", "2026-11-04T02:00:00Z", { state: "OPEN" })
  const unpaid = bopple("u", "2026-11-04T02:00:00Z", { state: "OPEN", tenders: [], net_amount_due_money: m(20) })
  const r = mergeDayOrders("2026-11-04", [], [paid, unpaid])
  assert.deepEqual(r.sales.map((o) => o.id), ["p"])
  assert.deepEqual(r.openUnpaid.map((o) => o.id), ["u"])
})

test("aestDateOf agrees with aestDayRange at every midnight, including year end and offset strings", () => {
  for (const day of ["2026-10-31", "2026-11-01", "2026-12-31", "2027-01-01", "2028-02-29", "2028-03-01"]) {
    const { startAt, endAt } = aestDayRange(day)
    assert.equal(aestDateOf(startAt), day, `${day} first instant`)
    assert.equal(aestDateOf(new Date(Date.parse(endAt) - 1).toISOString()), day, `${day} last millisecond`)
    assert.notEqual(aestDateOf(endAt), day, `${day} end is the next day`)
  }
  assert.equal(aestDateOf("2026-12-31T14:00:00Z"), "2027-01-01")
  assert.equal(aestDateOf("2026-11-01T23:59:59+10:00"), "2026-11-01")
  assert.equal(aestDateOf("2026-11-02T00:00:00+10:00"), "2026-11-02")
  assert.equal(aestDateOf("2026-11-01T20:00:00-05:00"), "2026-11-02") // 11:00 AEST next day
  assert.equal(aestDateOf(""), null)
})

test("floor: nothing placed before 1 Nov 2026 AEST is eligible, whatever the clock says", () => {
  const eligible = (created: string): SquareOrder => ({
    id: "f",
    version: 3,
    state: "OPEN",
    source: { name: "Bopple" },
    created_at: created,
    total_money: m(23.9),
    net_amount_due_money: m(0),
    tenders: [{ type: "OTHER", amount_money: m(23.9), other_details: { source: "BOPPLE", status: "CAPTURED" } }],
    fulfillments: [{ uid: "u", type: "IN_STORE", state: "PREPARED" }],
  })
  const nowsToTry = ["2026-11-04T13:55:00Z", "2026-11-30T13:55:00Z", "2027-06-01T00:00:00Z"].map((s) => Date.parse(s))
  for (const now of nowsToTry) {
    // The last millisecond of October in Brisbane, written three ways.
    assert.equal(completionBlocker(eligible("2026-10-31T13:59:59.999Z"), now), "placed before 1 Nov 2026")
    assert.equal(completionBlocker(eligible("2026-10-31T23:59:59.999+10:00"), now), "placed before 1 Nov 2026")
    // 1 Nov 00:00 UTC is 10:00 AEST on 1 Nov, after the floor.
    assert.equal(completionBlocker(eligible("2026-11-01T00:00:00Z"), now), null)
    // The first instant, written two ways.
    assert.equal(completionBlocker(eligible("2026-10-31T14:00:00.000Z"), now), null)
    assert.equal(completionBlocker(eligible("2026-11-01T00:00:00+10:00"), now), null)
    // Garbage dates never slip through as eligible.
    assert.equal(completionBlocker(eligible("garbage"), now), "no created time")
    assert.equal(completionBlocker(eligible(""), now), "no created time")
  }
})
