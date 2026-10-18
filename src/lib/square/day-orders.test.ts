import { test } from "node:test"
import assert from "node:assert/strict"
import { dayOrderRows, exactAtMinute, minutesOnDay } from "./day-orders"
import type { SquareOrder, SquarePayment } from "./client"

const money = (n: number) => ({ amount: Math.round(n * 100), currency: "AUD" })

test("minutesOnDay: Brisbane minutes from an ISO instant, outside the day allowed", () => {
  assert.equal(minutesOnDay("2026-10-11", "2026-10-10T21:59:00Z"), 7 * 60 + 59) // 7:59am AEST
  assert.equal(minutesOnDay("2026-10-11", "2026-10-10T13:30:00Z"), -30) // 11:30pm the night before
  assert.equal(minutesOnDay("2026-10-11", undefined), null)
  assert.equal(minutesOnDay("2026-10-11", "garbage"), null)
})

test("dayOrderRows + exactAtMinute: paid by then plus tables open at that minute (Sun 11 Oct, 7:59am)", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    // Cafe counter sales, paid as they went through
    { id: "c1", state: "COMPLETED", created_at: "2026-10-10T20:30:00Z", closed_at: "2026-10-10T20:31:00Z", total_money: money(1000), total_tip_money: money(0), line_items: [{ name: "x" }] },
    { id: "c2", state: "COMPLETED", created_at: "2026-10-10T21:40:00Z", closed_at: "2026-10-10T21:41:00Z", total_money: money(915), total_tip_money: money(0), line_items: [{ name: "x" }] },
    // Cafe sale paid at 8:05am: not yet
    { id: "c3", state: "COMPLETED", created_at: "2026-10-10T22:05:00Z", closed_at: "2026-10-10T22:05:30Z", total_money: money(50), total_tip_money: money(0), line_items: [{ name: "x" }] },
    // Table opened 7:30, paid 8:40 with a $10 tip: open at 7:59, worth 489 ex tip
    { id: "t1", state: "COMPLETED", created_at: "2026-10-10T21:30:00Z", closed_at: "2026-10-10T22:40:00Z", total_money: money(499), total_tip_money: money(10), ticket_name: "T3", line_items: [{ name: "x" }] },
    // Table opened 8:10: not open yet at 7:59
    { id: "t2", state: "COMPLETED", created_at: "2026-10-10T22:10:00Z", closed_at: "2026-10-10T23:00:00Z", total_money: money(200), total_tip_money: money(0), ticket_name: "T5", line_items: [{ name: "x" }] },
    // Bopple: paid when placed (7:50), bumped later
    { id: "b1", state: "COMPLETED", created_at: "2026-10-10T21:50:00Z", closed_at: "2026-10-10T23:30:00Z", total_money: money(30), total_tip_money: money(0), source: { name: "Bopple" }, tenders: [{ type: "OTHER", amount_money: money(30) }], line_items: [{ name: "x" }] },
    // Return-only shell: ignored
    { id: "r1", state: "COMPLETED", created_at: "2026-10-10T21:00:00Z", closed_at: "2026-10-10T21:00:00Z", total_money: money(0), line_items: [], returns: [{}] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "c1", amount_money: money(1000), created_at: "2026-10-10T20:31:00Z", device_details: { device_name: "Register 2 - Cafe" } },
    { id: "p2", status: "COMPLETED", order_id: "c2", amount_money: money(915), created_at: "2026-10-10T21:41:00Z", device_details: { device_name: "Register 2 - Cafe" } },
    { id: "p3", status: "COMPLETED", order_id: "c3", amount_money: money(50), created_at: "2026-10-10T22:05:30Z", device_details: { device_name: "Register 2 - Cafe" } },
    { id: "p4", status: "COMPLETED", order_id: "t1", amount_money: money(489), created_at: "2026-10-10T22:40:00Z", device_details: { device_name: "HH 4 - RESTAURANT" } },
    { id: "p5", status: "COMPLETED", order_id: "t2", amount_money: money(200), created_at: "2026-10-10T23:00:00Z", device_details: { device_name: "HH 4 - RESTAURANT" } },
  ]
  const rows = dayOrderRows("2026-10-11", orders, payments)
  assert.equal(rows.length, 6)
  const t1 = rows.find((r) => r.orderId === "t1")!
  assert.deepEqual(t1, { orderId: "t1", createdMin: 450, paidMin: 520, paidIncGst: 489, table: true, channel: "RESTAURANT" })
  const b1 = rows.find((r) => r.orderId === "b1")!
  assert.equal(b1.paidMin, b1.createdMin); assert.equal(b1.channel, "ONLINE"); assert.equal(b1.table, false)

  const at759 = exactAtMinute(rows, 7 * 60 + 59)
  assert.equal(at759.paid, 1000 + 915 + 30)
  assert.equal(at759.open, 489)
  assert.equal(at759.total, 2434)
  // By 9am everything has paid; nothing open
  const at9 = exactAtMinute(rows, 9 * 60)
  assert.equal(at9.open, 0)
  assert.equal(at9.total, 1000 + 915 + 50 + 489 + 200 + 30)
})

test("dayOrderRows: an open table still unpaid at sync time has no paid minute and counts as open from when it opened", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "t9", state: "OPEN", created_at: "2026-10-18T01:30:00Z", total_money: money(120), tenders: [], ticket_name: "T9", line_items: [{ name: "x" }] },
    // Open, paid in full via tenders but not yet closed: paid at its last payment
    { id: "t10", state: "OPEN", created_at: "2026-10-18T01:00:00Z", total_money: money(80), tenders: [{ type: "CARD", amount_money: money(80) }], net_amount_due_money: money(0), ticket_name: "T10", line_items: [{ name: "x" }] },
    // Open, nothing on it: ignored
    { id: "t11", state: "OPEN", created_at: "2026-10-18T01:00:00Z", total_money: money(0), tenders: [], ticket_name: "T11", line_items: [] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "q1", status: "COMPLETED", order_id: "t10", amount_money: money(80), created_at: "2026-10-18T01:45:00Z", device_details: { device_name: "HH 2 - RESTAURANT" } },
  ]
  const rows = dayOrderRows("2026-10-18", orders, payments)
  assert.equal(rows.length, 2)
  const t9 = rows.find((r) => r.orderId === "t9")!
  assert.equal(t9.paidMin, null); assert.equal(t9.table, true)
  const t10 = rows.find((r) => r.orderId === "t10")!
  assert.equal(t10.paidMin, 11 * 60 + 45)
  // 11:40: both tables open (T10 pays at 11:45); noon: T10 paid, T9 still open; 11:00: only T10 has opened
  assert.deepEqual(exactAtMinute(rows, 11 * 60 + 40), { paid: 0, open: 200, total: 200 })
  assert.deepEqual(exactAtMinute(rows, 12 * 60), { paid: 80, open: 120, total: 200 })
  assert.deepEqual(exactAtMinute(rows, 11 * 60), { paid: 0, open: 80, total: 80 })
  assert.deepEqual(exactAtMinute(rows, 10 * 60), { paid: 0, open: 0, total: 0 })
})
