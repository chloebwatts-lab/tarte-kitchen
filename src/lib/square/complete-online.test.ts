import { test } from "node:test"
import assert from "node:assert/strict"
import { completionBlocker, COMPLETE_FROM, MIN_AGE_MS } from "./complete-online"
import type { SquareOrder } from "./client"

const m = (d: number) => ({ amount: Math.round(d * 100), currency: "AUD" })
// Wed 4 Nov 2026, 23:55 AEST: when the nightly job runs.
const NOW = Date.parse("2026-11-04T13:55:00Z")

/** A real-shaped Beach House Bopple order: $23.90, paid in Bopple, ready at the counter. */
function bopple(over: Partial<SquareOrder> = {}): SquareOrder {
  return {
    id: "6xDJTOppaBUFZCgm2jqVGbPf0IEZY",
    location_id: "L940NQYQY567T",
    version: 7,
    state: "OPEN",
    source: { name: "Bopple" },
    created_at: "2026-11-04T00:21:11.596Z",
    total_money: m(23.9),
    net_amount_due_money: m(0),
    tenders: [{ type: "OTHER", amount_money: m(23.9), other_details: { source: "BOPPLE", status: "CAPTURED" } }],
    fulfillments: [{ uid: "55dced92", type: "IN_STORE", state: "PREPARED" }],
    ...over,
  }
}

test("completionBlocker: a paid November Bopple order at the counter is completed", () => {
  assert.equal(completionBlocker(bopple(), NOW), null)
  // Paid but never accepted on the POS (PROPOSED) still counts as a sale.
  assert.equal(completionBlocker(bopple({ fulfillments: [{ uid: "f", type: "IN_STORE", state: "PROPOSED" }] }), NOW), null)
  // October's pickup orders used PICKUP.
  assert.equal(completionBlocker(bopple({ fulfillments: [{ uid: "f", type: "PICKUP", state: "PREPARED", pickup_details: { pickup_at: "2026-11-04T01:09:00Z" } }] }), NOW), null)
})

test("completionBlocker: never touches an order placed before 1 Nov 2026 (October is journalled)", () => {
  assert.equal(COMPLETE_FROM, "2026-11-01T00:00:00+10:00")
  // 23:59:59 AEST on 31 Oct.
  assert.equal(completionBlocker(bopple({ created_at: "2026-10-31T13:59:59.999Z" }), NOW), "placed before 1 Nov 2026")
  assert.equal(completionBlocker(bopple({ created_at: "2026-10-01T00:54:22.479Z" }), NOW), "placed before 1 Nov 2026")
  // Midnight AEST on 1 Nov is the first instant allowed.
  assert.equal(completionBlocker(bopple({ created_at: "2026-10-31T14:00:00.000Z" }), NOW), null)
})

test("completionBlocker: leaves fresh, unpaid, non-Bopple and odd orders alone", () => {
  assert.equal(completionBlocker(bopple({ created_at: new Date(NOW - MIN_AGE_MS + 1000).toISOString() }), NOW), "placed in the last 20 minutes")
  assert.equal(completionBlocker(bopple({ state: "COMPLETED" }), NOW), "not open")
  assert.equal(completionBlocker(bopple({ source: { name: "Point of Sale" } }), NOW), "not a Bopple order")
  assert.equal(completionBlocker(bopple({ created_at: undefined }), NOW), "no created time")
  assert.equal(completionBlocker(bopple({ net_amount_due_money: m(5), tenders: [{ type: "OTHER", amount_money: m(18.9), other_details: { status: "CAPTURED" } }] }), NOW), "not fully paid")
  assert.equal(completionBlocker(bopple({ tenders: [{ type: "CARD", amount_money: m(23.9) }] }), NOW), "not paid by a captured Bopple tender")
  assert.equal(completionBlocker(bopple({ tenders: [{ type: "OTHER", amount_money: m(23.9), other_details: { source: "BOPPLE", status: "AUTHORIZED" } }] }), NOW), "not paid by a captured Bopple tender")
  assert.equal(completionBlocker(bopple({ tenders: [] }), NOW), "not fully paid")
  assert.equal(completionBlocker(bopple({ fulfillments: [{ uid: "f", type: "DELIVERY", state: "PREPARED" }] }), NOW), "fulfilment type DELIVERY")
  assert.equal(completionBlocker(bopple({ fulfillments: [{ uid: "f", type: "IN_STORE", state: "CANCELED" }] }), NOW), "fulfilment CANCELED")
  assert.equal(completionBlocker(bopple({ version: undefined }), NOW), "no order version")
})

test("completionBlocker: a pre-order for tomorrow waits until its pickup time has passed", () => {
  const tomorrow = { uid: "f", type: "PICKUP", state: "RESERVED", pickup_details: { pickup_at: "2026-11-04T21:30:00Z" } }
  assert.equal(completionBlocker(bopple({ fulfillments: [tomorrow] }), NOW), "pickup not due yet")
  assert.equal(completionBlocker(bopple({ fulfillments: [tomorrow] }), Date.parse("2026-11-05T13:55:00Z")), null)
})
