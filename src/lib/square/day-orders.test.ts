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

// ── Boundary conditions ──

test("exactAtMinute: paid at exactly that minute counts as paid; a table opened at exactly that minute counts as open", () => {
  const rows = [
    { orderId: "a", createdMin: 470, paidMin: 479, paidIncGst: 26.9, table: false, channel: "CAFE" as const },
    { orderId: "t", createdMin: 479, paidMin: 540, paidIncGst: 150, table: true, channel: "RESTAURANT" as const },
    // Cafe sale rung up before 7:59 but paid after: not counted either way (not a table)
    { orderId: "c", createdMin: 478, paidMin: 485, paidIncGst: 12.5, table: false, channel: "CAFE" as const },
    // A table paid at 7:59 on the dot is paid, not open
    { orderId: "t2", createdMin: 420, paidMin: 479, paidIncGst: 88, table: true, channel: "RESTAURANT" as const },
  ]
  assert.deepEqual(exactAtMinute(rows, 479), { paid: 114.9, open: 150, total: 264.9 })
  // One minute earlier: nothing paid yet, only the earlier table is open
  assert.deepEqual(exactAtMinute(rows, 478), { paid: 0, open: 88, total: 88 })
  // Once the table pays it moves from open to paid, total unchanged
  assert.deepEqual(exactAtMinute(rows, 540), { paid: 277.4, open: 0, total: 277.4 })
})

test("exactAtMinute: a table never paid stays open from when it opened; a non-table never paid is never counted", () => {
  const rows = [
    { orderId: "t", createdMin: 720, paidMin: null, paidIncGst: 64, table: true, channel: "RESTAURANT" as const },
    { orderId: "c", createdMin: 600, paidMin: null, paidIncGst: 9, table: false, channel: "OTHER" as const },
  ]
  assert.deepEqual(exactAtMinute(rows, 719), { paid: 0, open: 0, total: 0 })
  assert.deepEqual(exactAtMinute(rows, 720), { paid: 0, open: 64, total: 64 })
  assert.deepEqual(exactAtMinute(rows, 1439), { paid: 0, open: 64, total: 64 })
})

test("exactAtMinute: minutes outside 0..1439 and an empty day", () => {
  const rows = [
    // Rung up 11:50pm the night before, paid 11:52pm (AEST): minutes are negative
    { orderId: "late", createdMin: -10, paidMin: -8, paidIncGst: 20, table: false, channel: "CAFE" as const },
    // Paid ten past midnight after close: 1450
    { orderId: "after", createdMin: 1300, paidMin: 1450, paidIncGst: 95, table: true, channel: "RESTAURANT" as const },
  ]
  assert.deepEqual(exactAtMinute(rows, 0), { paid: 20, open: 0, total: 20 })
  assert.deepEqual(exactAtMinute(rows, -9), { paid: 0, open: 0, total: 0 })
  assert.deepEqual(exactAtMinute(rows, 1439), { paid: 20, open: 95, total: 115 })
  assert.deepEqual(exactAtMinute(rows, 1450), { paid: 115, open: 0, total: 115 })
  assert.deepEqual(exactAtMinute([], 600), { paid: 0, open: 0, total: 0 })
})

test("exactAtMinute: cents add up without float drift", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ orderId: `o${i}`, createdMin: 400 + i, paidMin: 400 + i, paidIncGst: 0.1, table: false, channel: "CAFE" as const }))
  assert.deepEqual(exactAtMinute(rows, 500), { paid: 1, open: 0, total: 1 })
})

test("dayOrderRows: duplicates, non-completed payments and orders without a created time", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "d1", state: "COMPLETED", created_at: "2026-10-18T00:00:00Z", closed_at: "2026-10-18T00:01:00Z", total_money: money(26.9), total_tip_money: money(0), line_items: [{ name: "Eggs" }] },
    { id: "d1", state: "COMPLETED", created_at: "2026-10-18T00:00:00Z", closed_at: "2026-10-18T00:01:00Z", total_money: money(26.9), total_tip_money: money(0), line_items: [{ name: "Eggs" }] },
    { id: "nocreated", state: "COMPLETED", closed_at: "2026-10-18T00:01:00Z", total_money: money(10), line_items: [{ name: "x" }] },
    // Open ticket, paid in full by tenders but not closed: a pending (not completed) payment must not set its paid minute
    { id: "t1", state: "OPEN", created_at: "2026-10-18T01:00:00Z", total_money: money(80), tenders: [{ type: "CARD", amount_money: money(80) }], net_amount_due_money: money(0), ticket_name: "T1", line_items: [{ name: "x" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "pend", status: "PENDING", order_id: "t1", amount_money: money(80), created_at: "2026-10-18T01:30:00Z", device_details: { device_name: "HH 2 - RESTAURANT" } },
  ]
  const rows = dayOrderRows("2026-10-18", orders, payments)
  assert.deepEqual(rows.map((r) => r.orderId), ["d1", "t1"])
  assert.equal(rows[0].createdMin, 600); assert.equal(rows[0].paidMin, 601); assert.equal(rows[0].paidIncGst, 26.9)
  // No completed payment and no closed_at: falls back to the created minute; no device means not RESTAURANT, but the ticket name makes it a table
  assert.equal(rows[1].paidMin, 660); assert.equal(rows[1].table, true); assert.equal(rows[1].channel, "OTHER")
})

test("dayOrderRows: a Bopple order placed 11:58pm AEST the night before has a negative created minute and is paid then", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "b", state: "COMPLETED", created_at: "2026-10-17T13:58:00Z", closed_at: "2026-10-17T14:20:00Z", total_money: money(36.3), total_tip_money: money(0), source: { name: "Bopple" }, line_items: [{ name: "x" }] },
  ]
  const [row] = dayOrderRows("2026-10-18", orders, [])
  assert.equal(row.createdMin, -2); assert.equal(row.paidMin, -2); assert.equal(row.channel, "ONLINE")
})
