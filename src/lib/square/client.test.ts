import { test } from "node:test"
import assert from "node:assert/strict"
import Decimal from "decimal.js"
import { aestDayRange, aggregateOrders, aggregatePayments, cleanItemName, feeRatePct, isPaidOrder, returnOnlyAmount, type SquareOrder, type SquarePayment } from "./client"
import { aestDates } from "./sync"

test("aestDayRange: Brisbane midnight to midnight in UTC, no daylight saving", () => {
  assert.deepEqual(aestDayRange("2026-10-01"), { startAt: "2026-09-30T14:00:00.000Z", endAt: "2026-10-01T14:00:00.000Z" })
  assert.deepEqual(aestDayRange("2026-12-31"), { startAt: "2026-12-30T14:00:00.000Z", endAt: "2026-12-31T14:00:00.000Z" })
  assert.throws(() => aestDayRange("1/10/2026"))
})

test("aestDates: yesterday + today in Brisbane time, oldest first", () => {
  // 23:30 UTC on 1 Oct is 09:30 AEST on 2 Oct.
  assert.deepEqual(aestDates(2, new Date("2026-10-01T23:30:00Z")), ["2026-10-01", "2026-10-02"])
  // 13:30 UTC on 1 Oct is still 23:30 AEST on 1 Oct.
  assert.deepEqual(aestDates(1, new Date("2026-10-01T13:30:00Z")), ["2026-10-01"])
  assert.deepEqual(aestDates(3, new Date("2026-10-01T15:00:00Z")), ["2026-09-30", "2026-10-01", "2026-10-02"])
})

test("cleanItemName drops Square's trailing full stop and squashes spaces", () => {
  assert.equal(cleanItemName("Corona. "), "Corona")
  assert.equal(cleanItemName("Chilli  Benny (Bacon)"), "Chilli Benny (Bacon)")
  assert.equal(cleanItemName(undefined), "")
})

const money = (dollars: number) => ({ amount: Math.round(dollars * 100), currency: "AUD" })

test("aggregateOrders folds variations into the item, totals inc GST and tax", () => {
  const orders: SquareOrder[] = [
    {
      id: "o1", state: "COMPLETED",
      total_money: money(19.4), total_tax_money: money(1.76), total_discount_money: money(0),
      line_items: [
        { name: "Tarte (Blueberry)", quantity: "1", total_money: money(9.5), catalog_object_id: "c1" },
        { name: "Crueller (Vanilla)", quantity: "1", total_money: money(9.9), catalog_object_id: "c2" },
      ],
    },
    {
      id: "o2", state: "COMPLETED",
      total_money: money(13.0), total_tax_money: money(1.18),
      line_items: [
        { name: "Cappuccino.", variation_name: "Large", quantity: "2", total_money: money(13.0), catalog_object_id: "c3" },
      ],
    },
    {
      id: "o3", state: "COMPLETED",
      total_money: money(6.5), total_tax_money: money(0.59),
      line_items: [
        { name: "Cappuccino.", variation_name: "Regular", quantity: "1", total_money: money(5.5), catalog_object_id: "c4" },
        { name: "Custom Amount", quantity: "1", item_type: "CUSTOM_AMOUNT", total_money: money(1.0) },
      ],
    },
    // Return-only order: comes off the day's sales (and its tax), not an order
    { id: "r1", state: "COMPLETED", total_money: money(0), returns: [{}], return_amounts: { total_money: money(30), tax_money: money(2.73) } },
  ]
  const agg = aggregateOrders(orders)
  assert.equal(agg.orderCount, 3)
  assert.equal(agg.totalIncGst.toNumber(), 8.9)
  assert.equal(agg.totalTax.toNumber(), 0.8)
  assert.equal(agg.returnsIncGst.toNumber(), 30)
  assert.equal(agg.tipsIncGst.toNumber(), 0)
  const cap = agg.items.find((i) => i.name === "Cappuccino")!
  assert.equal(cap.qty, 3)
  assert.equal(cap.revenue.toNumber(), 18.5)
  assert.equal(cap.catalogObjectId, "c3")
  assert.equal(agg.items.find((i) => i.name === "Custom Amount"), undefined)
  // Sorted by revenue, highest first.
  assert.equal(agg.items[0].name, "Cappuccino")
})

test("aggregatePayments: fees summed, card vs cash split, incomplete payments ignored", () => {
  const payments: SquarePayment[] = [
    { id: "p1", status: "COMPLETED", source_type: "CARD", amount_money: money(100), processing_fee: [{ amount_money: money(0.68) }] },
    { id: "p2", status: "COMPLETED", source_type: "CARD", amount_money: money(50), processing_fee: [{ amount_money: money(0.34) }] },
    { id: "p3", status: "COMPLETED", source_type: "CASH", amount_money: money(20) },
    { id: "p4", status: "FAILED", source_type: "CARD", amount_money: money(999), processing_fee: [{ amount_money: money(6.79) }] },
    { id: "p5", status: "COMPLETED", source_type: "EXTERNAL", amount_money: money(7) },
  ]
  const pay = aggregatePayments(payments)
  assert.equal(pay.fees.toNumber(), 1.02)
  assert.equal(pay.cardTakings.toNumber(), 150)
  assert.equal(pay.cashTakings.toNumber(), 20)
  assert.equal(pay.otherTakings.toNumber(), 7)
  assert.equal(pay.cardPayments, 2)
  assert.equal(feeRatePct(pay.fees, pay.cardTakings), 0.68)
  assert.equal(feeRatePct(new Decimal(5), new Decimal(0)), null)
})

test("fee check from the real 1 Oct Beach House transfer lands on 0.68% incl GST", () => {
  // $73.98 ex GST + $7.31 GST on ~$11.93k of card takings incl refunded payments.
  const rate = feeRatePct(new Decimal("81.29"), new Decimal("11929.59"))!
  assert.ok(rate > 0.675 && rate < 0.69, `rate ${rate}`)
})

test("isPaidOrder: Bopple order paid by external tender counts, part-paid table and empty order do not", () => {
  const money = (d: number) => ({ amount: Math.round(d * 100), currency: "AUD" })
  const bopple: SquareOrder = { id: "b1", state: "OPEN", total_money: money(41.5), tenders: [{ type: "OTHER", amount_money: money(41.5) }], net_amount_due_money: money(0) }
  const table: SquareOrder = { id: "t1", state: "OPEN", total_money: money(180), tenders: [{ type: "CARD", amount_money: money(60) }], net_amount_due_money: money(120) }
  const fresh: SquareOrder = { id: "t2", state: "OPEN", total_money: money(95) }
  const empty: SquareOrder = { id: "t3", state: "OPEN", total_money: money(0), tenders: [] }
  assert.equal(isPaidOrder(bopple), true)
  assert.equal(isPaidOrder(table), false)
  assert.equal(isPaidOrder(fresh), false)
  assert.equal(isPaidOrder(empty), false)
  // Tenders covering the total without a net_amount_due field also count.
  assert.equal(isPaidOrder({ id: "x", state: "OPEN", total_money: money(10), tenders: [{ amount_money: money(10) }] }), true)
})

test("aggregateOrders: Beach House 21 Oct 2026 lands on Square's gross sales, tips and the refund out", () => {
  // Square's email: gross sales $9,677.45, taxes $874.53, tips $8.60, returns $17.27 ex GST ($19.00 inc).
  // The orders summed to $9,705.05 (tips inside) and the refund sat on a return order with zero totals.
  const orders: SquareOrder[] = [
    { id: "a", state: "COMPLETED", total_money: money(9000), total_tip_money: money(8.6), total_tax_money: money(817.09), line_items: [{ name: "Day", quantity: "1", total_money: money(8991.4) }] },
    { id: "b", state: "COMPLETED", total_money: money(705.05), total_tip_money: money(0), total_tax_money: money(59.17), line_items: [{ name: "Night", quantity: "1", total_money: money(705.05) }] },
    { id: "r", state: "COMPLETED", total_money: money(0), total_tax_money: money(0), line_items: [], returns: [{ source_order_id: "a" }], return_amounts: { total_money: money(19), tax_money: money(1.73) } },
  ]
  const agg = aggregateOrders(orders)
  assert.equal(agg.totalIncGst.toNumber(), 9677.45)
  assert.equal(agg.tipsIncGst.toNumber(), 8.6)
  assert.equal(agg.returnsIncGst.toNumber(), 19)
  assert.equal(agg.totalIncGst.minus(agg.totalTax).toNumber(), 8802.92)
  assert.equal(agg.orderCount, 2)
})

test("returnOnlyAmount: zero-total shell uses return_amounts, a negative-total shell uses its own total, anything with lines is not a return", () => {
  assert.deepEqual(
    (({ incGst, tax }) => [incGst.toNumber(), tax.toNumber()])(returnOnlyAmount({ id: "r", total_money: money(0), returns: [{}], return_amounts: { total_money: money(19), tax_money: money(1.73) } })!),
    [19, 1.73]
  )
  assert.deepEqual(
    (({ incGst, tax }) => [incGst.toNumber(), tax.toNumber()])(returnOnlyAmount({ id: "r", total_money: money(-19), total_tax_money: money(-1.73), returns: [{}], return_amounts: { total_money: money(19), tax_money: money(1.73) } })!),
    [19, 1.73]
  )
  assert.equal(returnOnlyAmount({ id: "x", total_money: money(0), returns: [{}], line_items: [{ name: "Exchange", total_money: money(0) }] }), null)
  assert.equal(returnOnlyAmount({ id: "e", total_money: money(0), line_items: [] }), null)
})

test("aggregateOrders: a refund bigger than the day's sales leaves a negative day; shells with null or zero amounts add nothing and are not orders", () => {
  const orders: SquareOrder[] = [
    { id: "s1", state: "COMPLETED", total_money: money(26.9), total_tax_money: money(2.45), line_items: [{ name: "Chilli Benny (Bacon)", quantity: "1", total_money: money(26.9), catalog_object_id: "c1" }] },
    { id: "r1", state: "COMPLETED", total_money: money(0), total_tax_money: money(0), line_items: [], returns: [{ source_order_id: "yesterday" }], return_amounts: { total_money: money(60), tax_money: money(5.45) } },
    // No return_amounts and no totals at all
    { id: "r2", state: "COMPLETED", returns: [{}] },
    // return_amounts present but empty
    { id: "r3", state: "COMPLETED", total_money: money(0), line_items: [], returns: [{}], return_amounts: {} },
  ]
  const agg = aggregateOrders(orders)
  assert.equal(agg.orderCount, 1)
  assert.equal(agg.totalIncGst.toNumber(), -33.1)
  assert.equal(agg.totalTax.toNumber(), -3)
  assert.equal(agg.returnsIncGst.toNumber(), 60)
  assert.equal(agg.tipsIncGst.toNumber(), 0)
  assert.equal(agg.items.length, 1)
  assert.equal(agg.items[0].revenue.toNumber(), 26.9)
})
