import { test } from "node:test"
import assert from "node:assert/strict"
import { computeDayBreakdown, channelForDevice, aestHour, reportingGroup } from "./breakdown"
import { mergeItemName } from "./client"
import type { SquareOrder, SquarePayment } from "./client"

const money = (d: number) => ({ amount: Math.round(d * 100), currency: "AUD" })

test("channelForDevice: cafe / restaurant / handheld / Bopple / unknown", () => {
  assert.equal(channelForDevice("Register 3 - Cafe", "Point of Sale"), "CAFE")
  assert.equal(channelForDevice("HH 4 - RESTAURANT", "Point of Sale"), "RESTAURANT")
  assert.equal(channelForDevice("Restaurant 1", "Point of Sale"), "RESTAURANT")
  assert.equal(channelForDevice(undefined, "Bopple"), "ONLINE")
  assert.equal(channelForDevice("Register 3 - Cafe", "Bopple"), "ONLINE")
  assert.equal(channelForDevice(undefined, "Point of Sale"), "OTHER")
  assert.equal(channelForDevice("Tea Gardens Market", "Point of Sale"), "CAFE")
  assert.equal(channelForDevice("Tea Garden POS 4", "Point of Sale"), "CAFE")
  assert.equal(channelForDevice("HH8- TEA GARDEN", "Point of Sale"), "RESTAURANT")
  assert.equal(channelForDevice("Register 1 - Restaurant", "Point of Sale"), "RESTAURANT")
})

test("aestHour converts UTC instants to Brisbane hours", () => {
  assert.equal(aestHour("2026-10-04T03:56:29Z"), 13)
  assert.equal(aestHour("2026-10-03T22:10:00Z"), 8)
  assert.equal(aestHour(undefined), null)
})

test("computeDayBreakdown: paid vs open, surcharge, tips excluded, channels, registers, staff, groups", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "o1", state: "COMPLETED", closed_at: "2026-10-03T23:05:00Z", total_money: money(35.18), total_tax_money: money(3.2), total_tip_money: money(0),
      service_charges: [{ name: "Sunday Surcharge", total_money: money(1.68) }], source: { name: "Point of Sale" },
      line_items: [{ name: "Mango Smoothie", quantity: "1", total_money: money(13.0), catalog_object_id: "v-smoothie" }, { name: "Croissant.", quantity: "2", total_money: money(20.5), catalog_object_id: "v-croissant" }] },
    { id: "o2", state: "COMPLETED", closed_at: "2026-10-04T01:30:00Z", total_money: money(100), total_tip_money: money(10), service_charges: [], source: { name: "Point of Sale" },
      line_items: [{ name: "Fish & Chips", quantity: "2", total_money: money(90), catalog_object_id: "v-fish" }] },
    { id: "b1", state: "OPEN", created_at: "2026-10-04T00:10:00Z", total_money: money(41.5), tenders: [{ type: "OTHER", amount_money: money(41.5) }], net_amount_due_money: money(0), source: { name: "Bopple" },
      line_items: [{ name: "Chicken Sandwich", quantity: "1", total_money: money(41.5), catalog_object_id: "v-sando" }] },
    { id: "t1", state: "OPEN", created_at: "2026-10-04T02:00:00Z", total_money: money(180), tenders: [], source: { name: "Point of Sale" }, ticket_name: "T12",
      line_items: [{ name: "Wine", quantity: "2", total_money: money(180), catalog_object_id: "v-wine" }] },
    // Refund of $30 given at 12:30pm against o2 (a restaurant sale): off the day, off noon, off RESTAURANT
    { id: "r1", state: "COMPLETED", closed_at: "2026-10-04T02:30:00Z", total_money: money(0), returns: [{ source_order_id: "o2" }], return_amounts: { total_money: money(30) }, line_items: [] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "o1", source_type: "CARD", amount_money: money(35.18), device_details: { device_name: "Register 3 - Cafe" }, team_member_id: "tm-baily" },
    { id: "p2", status: "COMPLETED", order_id: "o2", source_type: "CARD", amount_money: money(110), device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
    { id: "p3", status: "FAILED", order_id: "o2", source_type: "CARD", amount_money: money(110), device_details: { device_name: "Register 2 - Cafe" }, team_member_id: "tm-x" },
    // No order id at all: Square counts it, so do we (1pm)
    { id: "p4", status: "COMPLETED", source_type: "CARD", amount_money: money(5), created_at: "2026-10-04T03:00:00Z" },
    // Part payment on the open table T12 (noon): a sale now, the rest owing
    { id: "p5", status: "COMPLETED", order_id: "t1", source_type: "CARD", amount_money: money(60), created_at: "2026-10-04T02:10:00Z", device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
    // Order the orders search has not returned yet (2pm), $4 of it refunded
    { id: "p6", status: "COMPLETED", order_id: "o-not-fetched", source_type: "CARD", amount_money: money(24), refunded_money: money(4), created_at: "2026-10-04T04:00:00Z" },
    // Refunded in full: nothing to count
    { id: "p7", status: "COMPLETED", source_type: "CARD", amount_money: money(10), refunded_money: money(10), created_at: "2026-10-04T04:30:00Z" },
  ]
  const catalog = (id?: string) => ({ "v-smoothie": { reportingCategory: "Juice Bar" }, "v-croissant": { reportingCategory: "Pastries" }, "v-fish": { reportingCategory: "Restaurant Food" }, "v-sando": { reportingCategory: "Cafe Food" }, "v-wine": { reportingCategory: "Restaurant Wine & Beer" } } as Record<string, { reportingCategory: string }>)[id ?? ""]
  const team = (id?: string) => ({ "tm-baily": "Baily Roberts", "tm-pauline": "Pauline Stefani" } as Record<string, string>)[id ?? ""]

  const b = computeDayBreakdown("2026-10-04", orders, payments, catalog, team)
  // o1 35.18 + o2 (total_money 100, tip 10 -> 90) + Bopple 41.5
  // + part payment 60 on T12 + orderless 5 + unfetched order 24 - 4 refunded (+ nothing from the fully refunded p7)
  // - the $30 refund on r1
  const paidOrdersTotal = 35.18 + 90 + 41.5
  const dayTotal = Math.round((paidOrdersTotal + 60 + 5 + 20 - 30) * 100) / 100
  assert.equal(b.paidIncGst, dayTotal)
  assert.equal(b.returnsIncGst, 30)
  assert.equal(b.partPaidIncGst, 60)
  assert.equal(b.tipsIncGst, 10)
  assert.equal(b.paidOrders, 3 + 2) // the two stray payments with money count as transactions, the part payment and the refund do not
  assert.equal(b.openTables, 1)
  assert.equal(b.openTablesIncGst, 120) // 180 on the table, 60 of it already tapped
  assert.equal(b.surchargeIncGst, 1.68)
  assert.equal(b.surchargeName, "Sunday Surcharge")
  assert.equal(b.avgTransaction, Math.round((dayTotal / 5) * 100) / 100)
  // Hours: o1 23:05Z -> 9am, o2 01:30Z -> 11am, b1 created 00:10Z -> 10am,
  // part payment 02:10Z -> noon less the 02:30Z refund, orderless 03:00Z -> 1pm, unfetched 04:00Z -> 2pm
  assert.equal(b.hourly[9], 35.18); assert.equal(b.hourly[11], 90); assert.equal(b.hourly[10], 41.5)
  assert.equal(b.hourly[12], 30); assert.equal(b.hourly[13], 5); assert.equal(b.hourly[14], 20)
  assert.equal(b.hourlyOrders.reduce((s, n) => s + n, 0), 5)
  assert.deepEqual(b.channels.CAFE, { sales: 35.18, orders: 1 })
  assert.deepEqual(b.channels.RESTAURANT, { sales: 60, orders: 1 }) // 90 less the 30 refunded on o2
  assert.deepEqual(b.channels.ONLINE, { sales: 41.5, orders: 1 })
  assert.equal(b.registers.find((r) => r.name === "Bopple")?.channel, "ONLINE")
  assert.equal(b.registers.find((r) => r.name === "Register 3 - Cafe")?.avgSale, 35.18)
  const pauline = b.staff.find((s) => s.name === "Pauline Stefani")!
  assert.equal(pauline.channel, "RESTAURANT"); assert.equal(pauline.sales, 90); assert.deepEqual(pauline.registers, ["HH 4 - RESTAURANT"])
  assert.equal(b.staff.find((s) => s.id === "tm-x"), undefined) // failed payment ignored
  const pastries = b.groups.find((g) => g.name === "Pastries")!
  assert.equal(pastries.qty, 2); assert.equal(pastries.sales, 20.5); assert.equal(pastries.topItems[0].name, "Croissant")
  assert.equal(b.groups.find((g) => g.name === "Restaurant Wine & Beer"), undefined) // open table not counted
  assert.equal(b.unmatchedPayments, 3) // p4, p6, p7
})

test("computeDayBreakdown: a fully paid open table (part payments covering the bill) is a paid order, not owing", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "t9", state: "OPEN", created_at: "2026-10-04T02:00:00Z", total_money: money(100), tenders: [{ type: "CARD", amount_money: money(50) }, { type: "CARD", amount_money: money(50) }], net_amount_due_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Wine", quantity: "2", total_money: money(100), catalog_object_id: "v-wine" }] },
    { id: "t10", state: "OPEN", created_at: "2026-10-04T02:05:00Z", total_money: money(80), tenders: [{ type: "CARD", amount_money: money(30) }], source: { name: "Point of Sale" },
      line_items: [{ name: "Beer", quantity: "4", total_money: money(80), catalog_object_id: "v-beer" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "q1", status: "COMPLETED", order_id: "t9", source_type: "CARD", amount_money: money(50), created_at: "2026-10-04T02:20:00Z" },
    { id: "q2", status: "COMPLETED", order_id: "t9", source_type: "CARD", amount_money: money(50), created_at: "2026-10-04T02:25:00Z" },
    { id: "q3", status: "COMPLETED", order_id: "t10", source_type: "CARD", amount_money: money(30), created_at: "2026-10-04T02:30:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 130) // t9 in full as a paid order, 30 tapped on t10
  assert.equal(b.partPaidIncGst, 30)
  assert.equal(b.paidOrders, 1)
  assert.equal(b.openTables, 1)
  assert.equal(b.openTablesIncGst, 50)
  assert.equal(b.unmatchedPayments, 0)
  assert.equal(b.hourly[12], 130)
})

test("computeDayBreakdown: empty day", () => {
  const b = computeDayBreakdown("2026-10-06", [], [], () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 0); assert.equal(b.avgTransaction, 0); assert.deepEqual(b.groups, []); assert.equal(b.hourly.length, 24)
})

test("computeDayBreakdown staffChannels: one row per person per channel, paid orders only, tips out, online has no staff row", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    // Baily on the cafe till in the morning
    { id: "c1", state: "COMPLETED", closed_at: "2026-10-03T23:05:00Z", total_money: money(26.9), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Smashed Avo", quantity: "1", total_money: money(26.9), catalog_object_id: "v-avo" }] },
    { id: "c2", state: "COMPLETED", closed_at: "2026-10-03T23:40:00Z", total_money: money(13.1), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Croissant.", quantity: "2", total_money: money(13.1), catalog_object_id: "v-croissant" }] },
    // Baily on a restaurant handheld at lunch, $5 tip on a $60 bill
    { id: "r1", state: "COMPLETED", closed_at: "2026-10-04T02:30:00Z", total_money: money(60), total_tip_money: money(5), source: { name: "Point of Sale" },
      line_items: [{ name: "Fish & Chips", quantity: "1", total_money: money(55), catalog_object_id: "v-fish" }] },
    // Pauline, restaurant handheld
    { id: "r2", state: "COMPLETED", closed_at: "2026-10-04T03:00:00Z", total_money: money(180), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Wine", quantity: "2", total_money: money(180), catalog_object_id: "v-wine" }] },
    // Open table Pauline opened, not yet paid: must not count for anyone
    { id: "t1", state: "OPEN", created_at: "2026-10-04T03:10:00Z", total_money: money(95), tenders: [], source: { name: "Point of Sale" }, ticket_name: "T4",
      created_by_team_member_id: "tm-pauline",
      line_items: [{ name: "Lobster Roll", quantity: "1", total_money: money(95), catalog_object_id: "v-lobster" }] },
    // Bopple online order, fully paid, created by a staff id: counted as sales but gets no staff row
    { id: "b1", state: "OPEN", created_at: "2026-10-04T00:10:00Z", total_money: money(41.5), tenders: [{ type: "OTHER", amount_money: money(41.5) }], net_amount_due_money: money(0), source: { name: "Bopple" },
      created_by_team_member_id: "tm-baily",
      line_items: [{ name: "Chicken Sandwich", quantity: "1", total_money: money(41.5), catalog_object_id: "v-sando" }] },
    // Paid order with no matching payment record: credited to whoever opened it, channel OTHER
    { id: "x1", state: "COMPLETED", closed_at: "2026-10-04T04:00:00Z", total_money: money(9.5), total_tip_money: money(0), source: { name: "Point of Sale" },
      created_by_team_member_id: "tm-hannah",
      line_items: [{ name: "Flat White", quantity: "1", total_money: money(9.5), catalog_object_id: "v-coffee" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "c1", source_type: "CARD", amount_money: money(26.9), device_details: { device_name: "Register 3 - Cafe" }, team_member_id: "tm-baily" },
    { id: "p2", status: "COMPLETED", order_id: "c2", source_type: "CASH", amount_money: money(13.1), device_details: { device_name: "Register 3 - Cafe" }, team_member_id: "tm-baily" },
    { id: "p3", status: "COMPLETED", order_id: "r1", source_type: "CARD", amount_money: money(65), device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-baily" },
    { id: "p4", status: "COMPLETED", order_id: "r2", source_type: "CARD", amount_money: money(180), device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
    // Failed attempt on r2 by someone else: ignored
    { id: "p5", status: "FAILED", order_id: "r2", source_type: "CARD", amount_money: money(180), device_details: { device_name: "Register 2 - Cafe" }, team_member_id: "tm-x" },
  ]
  const team = (id?: string) => ({ "tm-baily": "Baily Roberts", "tm-pauline": "Pauline Stefani", "tm-hannah": "Hannah Susman" } as Record<string, string>)[id ?? ""]

  const b = computeDayBreakdown("2026-10-04", orders, payments, () => undefined, team)

  // Baily: two rows, one per channel, tip stripped from the restaurant bill.
  const bailyRows = b.staffChannels.filter((s) => s.id === "tm-baily")
  assert.equal(bailyRows.length, 2)
  assert.deepEqual(bailyRows.find((s) => s.channel === "CAFE"), { id: "tm-baily", name: "Baily Roberts", channel: "CAFE", sales: 40, orders: 2 })
  assert.deepEqual(bailyRows.find((s) => s.channel === "RESTAURANT"), { id: "tm-baily", name: "Baily Roberts", channel: "RESTAURANT", sales: 55, orders: 1 })

  // Pauline: only the paid handheld order; the open table she opened is not counted.
  assert.deepEqual(b.staffChannels.filter((s) => s.id === "tm-pauline"), [{ id: "tm-pauline", name: "Pauline Stefani", channel: "RESTAURANT", sales: 180, orders: 1 }])
  assert.equal(b.openTables, 1)

  // Online order is in sales but has no staff row for anyone.
  assert.deepEqual(b.channels.ONLINE, { sales: 41.5, orders: 1 })
  assert.equal(b.staffChannels.some((s) => s.channel === "ONLINE"), false)
  assert.equal(b.staffChannels.filter((s) => s.id === "tm-baily").reduce((n, s) => n + s.orders, 0), 3)

  // No payment record: credited to who opened it, on the OTHER channel.
  assert.deepEqual(b.staffChannels.filter((s) => s.id === "tm-hannah"), [{ id: "tm-hannah", name: "Hannah Susman", channel: "OTHER", sales: 9.5, orders: 1 }])
  // Failed payment never creates a row.
  assert.equal(b.staffChannels.some((s) => s.id === "tm-x"), false)

  // Rows sum to the paid staff-attributed sales and sort by sales, highest first.
  assert.deepEqual(b.staffChannels.map((s) => s.sales), [180, 55, 40, 9.5])
  assert.equal(b.staffChannels.reduce((n, s) => n + s.orders, 0), 5)
  assert.equal(b.paidIncGst, 26.9 + 13.1 + 55 + 180 + 41.5 + 9.5)
  assert.equal(b.tipsIncGst, 5)

  // The combined staff row still sees Baily on both registers.
  assert.deepEqual(b.staff.find((s) => s.id === "tm-baily")?.registers, ["Register 3 - Cafe", "HH 4 - RESTAURANT"])
})

test("computeDayBreakdown staffChannels: empty day and a paid order with no staff at all give no rows", () => {
  assert.deepEqual(computeDayBreakdown("2026-10-06", [], [], () => undefined, () => undefined).staffChannels, [])
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "k1", state: "COMPLETED", closed_at: "2026-10-05T23:00:00Z", total_money: money(5.5), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Long Black", quantity: "1", total_money: money(5.5), catalog_object_id: "v-coffee" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "k1", source_type: "CARD", amount_money: money(5.5), device_details: { device_name: "Register 1 - Cafe" } },
  ]
  const b = computeDayBreakdown("2026-10-06", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 5.5)
  assert.deepEqual(b.staffChannels, [])
  assert.deepEqual(b.staff, [])
})

test("computeDayBreakdown: a paid order's own payment records are never added again as strays", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    // Split bill, COMPLETED at 1pm, two card payments taken at noon and 12:40: one order, $150, once
    { id: "s1", state: "COMPLETED", closed_at: "2026-10-04T03:00:00Z", total_money: money(150), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Fish & Chips", quantity: "2", total_money: money(90), catalog_object_id: "v-fish" }, { name: "Wine", quantity: "1", total_money: money(60), catalog_object_id: "v-wine" }] },
    // Bopple order, OPEN but paid in full by an external tender, with a matching payment record at 10am
    { id: "b1", state: "OPEN", created_at: "2026-10-04T00:10:00Z", total_money: money(41.5), tenders: [{ type: "OTHER", amount_money: money(41.5) }], net_amount_due_money: money(0), source: { name: "Bopple" },
      line_items: [{ name: "Chicken Sandwich", quantity: "1", total_money: money(41.5), catalog_object_id: "v-sando" }] },
    // Open table, tenders mirror the one $40 card payment so far, $60 still owing
    { id: "t1", state: "OPEN", created_at: "2026-10-04T02:00:00Z", total_money: money(100), tenders: [{ type: "CARD", amount_money: money(40) }], net_amount_due_money: money(60), source: { name: "Point of Sale" },
      line_items: [{ name: "Wine", quantity: "2", total_money: money(100), catalog_object_id: "v-wine" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "s1", source_type: "CARD", amount_money: money(75), created_at: "2026-10-04T02:00:00Z", device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
    { id: "p2", status: "COMPLETED", order_id: "s1", source_type: "CARD", amount_money: money(75), created_at: "2026-10-04T02:40:00Z", device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
    { id: "p3", status: "COMPLETED", order_id: "b1", source_type: "EXTERNAL", amount_money: money(41.5), created_at: "2026-10-04T00:10:00Z" },
    { id: "p4", status: "COMPLETED", order_id: "t1", source_type: "CARD", amount_money: money(40), created_at: "2026-10-04T02:30:00Z", device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
  ]
  const team = (id?: string) => ({ "tm-pauline": "Pauline Stefani" } as Record<string, string>)[id ?? ""]
  const b = computeDayBreakdown("2026-10-04", orders, payments, () => undefined, team)

  assert.equal(b.paidIncGst, 150 + 41.5 + 40)
  assert.equal(b.partPaidIncGst, 40)
  assert.equal(b.paidOrders, 2) // s1 and b1; the part payment is not a transaction yet
  assert.equal(b.openTables, 1)
  assert.equal(b.openTablesIncGst, 60)
  assert.equal(b.unmatchedPayments, 0)
  // Paid orders land in the hour they closed, not the hour each payment was tapped
  assert.equal(b.hourly[13], 150)
  assert.equal(b.hourly[10], 41.5)
  assert.equal(b.hourly[12], 40) // only the part payment on t1 sits at noon
  assert.equal(Math.round(b.hourly.reduce((s, n) => s + n, 0) * 100) / 100, b.paidIncGst)
  assert.equal(b.hourlyOrders.reduce((s, n) => s + n, 0), 2)
  // Staff and channel boards see the split bill once
  assert.deepEqual(b.channels.RESTAURANT, { sales: 150, orders: 1 })
  assert.deepEqual(b.staffChannels.filter((s) => s.id === "tm-pauline"), [{ id: "tm-pauline", name: "Pauline Stefani", channel: "RESTAURANT", sales: 150, orders: 1 }])
})

test("computeDayBreakdown: an order listed twice (closed and open search) counts once and its payment is not a stray", () => {
  const order = { id: "d1", state: "COMPLETED", closed_at: "2026-10-04T01:00:00Z", created_at: "2026-10-04T00:50:00Z", total_money: money(26.9), total_tip_money: money(0), source: { name: "Point of Sale" },
    line_items: [{ name: "Smashed Avo", quantity: "1", total_money: money(26.9), catalog_object_id: "v-avo" }] }
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "d1", source_type: "CARD", amount_money: money(26.9), created_at: "2026-10-04T01:00:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", [order, { ...order }], payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 26.9)
  assert.equal(b.paidOrders, 1)
  assert.equal(b.unmatchedPayments, 0)
  assert.equal(b.hourly[11], 26.9)
})

test("computeDayBreakdown: payments on an open table that exceed the bill are clamped, nothing owing, table not open", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    // Bill was $80 when $100 was tapped, then an item was removed: $50 ex a $10 tip
    { id: "t1", state: "OPEN", created_at: "2026-10-04T02:00:00Z", total_money: money(60), total_tip_money: money(10), tenders: [], source: { name: "Point of Sale" },
      line_items: [{ name: "Wine", quantity: "1", total_money: money(50), catalog_object_id: "v-wine" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "t1", source_type: "CARD", amount_money: money(100), created_at: "2026-10-04T02:10:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 50)
  assert.equal(b.partPaidIncGst, 50)
  assert.equal(b.openTables, 0)
  assert.equal(b.openTablesIncGst, 0)
  assert.equal(b.paidOrders, 0)
  assert.equal(b.avgTransaction, 0)
  assert.equal(b.unmatchedPayments, 0)
})

test("computeDayBreakdown: open table whose payment was refunded back in full is still owing in full", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "t1", state: "OPEN", created_at: "2026-10-04T02:00:00Z", total_money: money(95), tenders: [], source: { name: "Point of Sale" },
      line_items: [{ name: "Lobster Roll", quantity: "1", total_money: money(95), catalog_object_id: "v-lobster" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "t1", source_type: "CARD", amount_money: money(50), refunded_money: money(50), created_at: "2026-10-04T02:10:00Z" },
    // Refund larger than the payment (bad data): must not go negative
    { id: "p2", status: "COMPLETED", order_id: "t1", source_type: "CARD", amount_money: money(10), refunded_money: money(15), created_at: "2026-10-04T02:20:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 0)
  assert.equal(b.partPaidIncGst, 0)
  assert.equal(b.openTables, 1)
  assert.equal(b.openTablesIncGst, 95)
  assert.equal(b.hourly[12], 0)
})

test("computeDayBreakdown: only COMPLETED strays count; pending, approved, failed and canceled payments add nothing", () => {
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "APPROVED", source_type: "CARD", amount_money: money(26.9), created_at: "2026-10-04T02:00:00Z" },
    { id: "p2", status: "PENDING", order_id: "ghost-1", source_type: "CARD", amount_money: money(13.1), created_at: "2026-10-04T02:00:00Z" },
    { id: "p3", status: "FAILED", order_id: "ghost-2", source_type: "CARD", amount_money: money(100), created_at: "2026-10-04T02:00:00Z" },
    { id: "p4", status: "CANCELED", source_type: "CARD", amount_money: money(100), created_at: "2026-10-04T02:00:00Z" },
    // The one real sale, a $5.50 long black whose order the search has not returned yet
    { id: "p5", status: "COMPLETED", order_id: "ghost-3", source_type: "CASH", amount_money: money(5.5), created_at: "2026-10-04T02:00:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", [], payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 5.5)
  assert.equal(b.paidOrders, 1)
  assert.equal(b.avgTransaction, 5.5)
  assert.equal(b.unmatchedPayments, 1)
  assert.equal(b.hourly[12], 5.5)
  assert.equal(b.hourlyOrders[12], 1)
  assert.equal(b.partPaidIncGst, 0)
  assert.equal(b.openTables, 0)
})

test("computeDayBreakdown: strays with no amount, a negative net or no timestamp do not break the totals", () => {
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    // No amount at all: counted as unmatched, adds nothing
    { id: "p1", status: "COMPLETED", created_at: "2026-10-04T02:00:00Z" },
    // Refund bigger than the payment: unmatched, adds nothing, not a transaction
    { id: "p2", status: "COMPLETED", order_id: "ghost", source_type: "CARD", amount_money: money(20), refunded_money: money(25), created_at: "2026-10-04T02:00:00Z" },
    // Real money but Square gave no created_at: still in the day total, just not in any hour
    { id: "p3", status: "COMPLETED", source_type: "CARD", amount_money: money(26.9) },
    // Midnight UTC is 10am Brisbane
    { id: "p4", status: "COMPLETED", source_type: "CARD", amount_money: money(4.5), created_at: "2026-10-04T00:00:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", [], payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 31.4)
  assert.equal(b.paidOrders, 2)
  assert.equal(b.unmatchedPayments, 4)
  assert.equal(b.hourly[10], 4.5)
  assert.equal(b.hourly.reduce((s, n) => s + n, 0), 4.5)
  assert.equal(b.hourlyOrders.reduce((s, n) => s + n, 0), 1)
  assert.equal(b.avgTransaction, 15.7)
})

test("computeDayBreakdown: paid orders use the order total, a partial refund on their payment record does not change it", () => {
  // Square records refunds on completed orders as return orders; the original
  // payment's refunded_money must not be subtracted a second time here.
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "o1", state: "COMPLETED", closed_at: "2026-10-04T01:00:00Z", total_money: money(53.8), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Smashed Avo", quantity: "2", total_money: money(53.8), catalog_object_id: "v-avo" }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "o1", source_type: "CARD", amount_money: money(53.8), refunded_money: money(26.9), created_at: "2026-10-04T01:00:00Z" },
  ]
  const b = computeDayBreakdown("2026-10-04", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 53.8)
  assert.equal(b.paidOrders, 1)
  assert.equal(b.unmatchedPayments, 0)
})

// ── Reporting groups, Sides, merged product names, table attribution (Shawna, 18 Oct 2026) ──

test("reportingGroup: drinks categories merge, everything else keeps its name", () => {
  assert.equal(reportingGroup("Restaurant Wine & Beer"), "Alcohol")
  assert.equal(reportingGroup("Restaurant Cocktails"), "Alcohol")
  assert.equal(reportingGroup("Cafe Alcohol"), "Alcohol")
  assert.equal(reportingGroup("Cafe Coffee & Tea"), "Coffee & Tea")
  assert.equal(reportingGroup("Restaurant Coffee & Tea"), "Coffee & Tea")
  assert.equal(reportingGroup("Juice Bar"), "Cold Drinks")
  assert.equal(reportingGroup("Restaurant Drinks"), "Cold Drinks")
  assert.equal(reportingGroup("restaurant   wine&beer"), "Alcohol")
  assert.equal(reportingGroup("Cafe Food"), "Cafe Food")
  assert.equal(reportingGroup(undefined), "Uncategorised")
})

test("mergeItemName: cafe full stop, restaurant ' - R' and 'Meal. - Toastie.' all become one name", () => {
  assert.equal(mergeItemName("Cappuccino."), "Cappuccino")
  assert.equal(mergeItemName("Cappuccino - R"), "Cappuccino")
  assert.equal(mergeItemName("Cappuccino -R"), "Cappuccino")
  assert.equal(mergeItemName("Kids Meal. - Toastie."), "Kids Meal - Toastie")
  assert.equal(mergeItemName("Orange Juice. "), "Orange Juice")
  assert.equal(mergeItemName("Ricotta Hotcakes"), "Ricotta Hotcakes")
  assert.equal(mergeItemName(undefined), "")
})

test("computeDayBreakdown: merged groups, Sides from the Food Sides list, top 10 merges cafe and restaurant names", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "o1", state: "COMPLETED", closed_at: "2026-10-18T00:05:00Z", total_money: money(42), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [
        // Eggs $26 with bacon ($6, Food Sides) and "No onion" ($0, Food Sides) and oat milk ($1, Milk list)
        { name: "Eggs Your Way.", quantity: "1", total_money: money(26 + 6 + 1), catalog_object_id: "v-eggs",
          modifiers: [
            { catalog_object_id: "m-bacon", name: "Bacon", quantity: "1", base_price_money: money(6), total_price_money: money(6) },
            { catalog_object_id: "m-noonion", name: "No onion", quantity: "1", base_price_money: money(0) },
            { catalog_object_id: "m-oat", name: "Oat milk", quantity: "1", base_price_money: money(1), total_price_money: money(1) },
          ] },
        { name: "Cappuccino.", quantity: "2", total_money: money(9), catalog_object_id: "v-cap-cafe" },
      ] },
    { id: "o2", state: "COMPLETED", closed_at: "2026-10-18T02:05:00Z", total_money: money(86), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [
        // Two fish, each with halloumi x1 ($8): side units = 2
        { name: "Fish & Chips", quantity: "2", total_money: money(70 + 16), catalog_object_id: "v-fish",
          modifiers: [{ catalog_object_id: "m-hall", name: "Halloumi", quantity: "1", base_price_money: money(8), total_price_money: money(16) }] },
        { name: "Cappuccino - R", quantity: "1", total_money: money(5), catalog_object_id: "v-cap-rest" },
        { name: "Glass of Shiraz", quantity: "1", total_money: money(14), catalog_object_id: "v-shiraz" },
        { name: "Orange Juice.", quantity: "1", total_money: money(9), catalog_object_id: "v-oj" },
        { name: "Negroni", quantity: "1", total_money: money(22), catalog_object_id: "v-negroni" },
      ] },
  ]
  const catalog = (id?: string) => ({
    "v-eggs": { reportingCategory: "Cafe Food" }, "v-cap-cafe": { reportingCategory: "Cafe Coffee & Tea" },
    "v-fish": { reportingCategory: "Restaurant Food" }, "v-cap-rest": { reportingCategory: "Restaurant Coffee & Tea" },
    "v-shiraz": { reportingCategory: "Restaurant Wine & Beer" }, "v-oj": { reportingCategory: "Juice Bar" }, "v-negroni": { reportingCategory: "Restaurant Cocktails" },
  } as Record<string, { reportingCategory: string }>)[id ?? ""]
  const modList = (id?: string) => ({ "m-bacon": "Food Sides", "m-noonion": "Food Sides", "m-hall": "Food Sides", "m-oat": "Milk" } as Record<string, string>)[id ?? ""]
  const b = computeDayBreakdown("2026-10-18", orders, [], catalog, () => undefined, null, modList)
  const g = (name: string) => b.groups.find((x) => x.name === name)
  // Sides: bacon 6 + halloumi 8 x 2 = 22, three units
  assert.equal(g("Sides")?.sales, 22); assert.equal(g("Sides")?.qty, 3)
  assert.deepEqual(g("Sides")?.topItems, [{ name: "Halloumi", qty: 2, sales: 16 }, { name: "Bacon", qty: 1, sales: 6 }])
  // The dish groups lose the side money and say so; oat milk and "No onion" stay on the dish
  assert.equal(g("Cafe Food")?.sales, 27); assert.equal(g("Cafe Food")?.countedUnderSides, 6)
  assert.equal(g("Restaurant Food")?.sales, 70); assert.equal(g("Restaurant Food")?.countedUnderSides, 16)
  assert.equal(g("Sides")?.countedUnderSides, undefined)
  // Merged groups
  assert.equal(g("Coffee & Tea")?.sales, 14); assert.equal(g("Coffee & Tea")?.qty, 3)
  assert.deepEqual(g("Coffee & Tea")?.topItems, [{ name: "Cappuccino", qty: 3, sales: 14 }])
  assert.equal(g("Alcohol")?.sales, 36)
  assert.deepEqual(g("Alcohol")?.topItems.map((t) => t.name), ["Negroni", "Glass of Shiraz"])
  assert.equal(g("Cold Drinks")?.sales, 9); assert.deepEqual(g("Cold Drinks")?.topItems, [{ name: "Orange Juice", qty: 1, sales: 9 }])
  assert.equal(g("Cafe Coffee & Tea"), undefined); assert.equal(g("Juice Bar"), undefined)
  // Groups still add up to the line items (sides moved, not added)
  const sum = b.groups.reduce((s, x) => s + x.sales, 0)
  assert.equal(Math.round(sum * 100) / 100, 33 + 9 + 86 + 5 + 14 + 9 + 22)
})

test("computeDayBreakdown: a side priced above the line (comped dish) moves only what is on the line, no modifier list means no Sides group", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "o1", state: "COMPLETED", closed_at: "2026-10-18T00:05:00Z", total_money: money(5), total_tip_money: money(0),
      line_items: [{ name: "Toast", quantity: "1", total_money: money(5), catalog_object_id: "v-toast",
        modifiers: [{ catalog_object_id: "m-avo", name: "Avo", quantity: "1", base_price_money: money(9) }] }] },
  ]
  const cat = () => ({ reportingCategory: "Cafe Food" })
  const capped = computeDayBreakdown("2026-10-18", orders, [], cat, () => undefined, null, () => "Food Sides")
  assert.equal(capped.groups.find((g) => g.name === "Sides")?.sales, 5)
  assert.equal(capped.groups.find((g) => g.name === "Cafe Food")?.sales, 0)
  assert.equal(capped.groups.reduce((n, g) => n + g.sales, 0), 5)
  assert.equal(capped.groups.find((g) => g.name === "Cafe Food")?.countedUnderSides, 5)
  const plain = computeDayBreakdown("2026-10-18", orders, [], cat, () => undefined)
  assert.equal(plain.groups.find((g) => g.name === "Sides"), undefined)
  assert.equal(plain.groups.find((g) => g.name === "Cafe Food")?.sales, 5)
})

test("computeDayBreakdown: restaurant sales go to the table owner, cafe sales to who took the payment", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    // Pauline's table, paid on a handheld by Baily: Pauline's sale
    { id: "r1", state: "COMPLETED", closed_at: "2026-10-18T02:30:00Z", total_money: money(120), total_tip_money: money(0), source: { name: "Point of Sale" },
      created_by_team_member_id: "tm-pauline", line_items: [{ name: "Wine", quantity: "2", total_money: money(120) }] },
    // Cafe order rung up by Hannah, paid at the till by Baily: Baily's sale, on Register 3
    { id: "c1", state: "COMPLETED", closed_at: "2026-10-18T00:30:00Z", total_money: money(12), total_tip_money: money(0), source: { name: "Point of Sale" },
      created_by_team_member_id: "tm-hannah", line_items: [{ name: "Flat White", quantity: "1", total_money: money(12) }] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "r1", amount_money: money(120), device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-baily" },
    { id: "p2", status: "COMPLETED", order_id: "c1", amount_money: money(12), device_details: { device_name: "Register 3 - Cafe" }, team_member_id: "tm-baily" },
  ]
  const team = (id?: string) => ({ "tm-baily": "Baily", "tm-pauline": "Pauline", "tm-hannah": "Hannah" } as Record<string, string>)[id ?? ""]
  const b = computeDayBreakdown("2026-10-18", orders, payments, () => undefined, team)
  assert.deepEqual(b.staff.map((s) => [s.name, s.channel, s.sales, s.registers]), [["Pauline", "RESTAURANT", 120, ["HH 4 - RESTAURANT"]], ["Baily", "CAFE", 12, ["Register 3 - Cafe"]]])
  assert.equal(b.staff.find((s) => s.name === "Hannah"), undefined)
})

test("computeDayBreakdown: side units are modifier qty x line qty, a free side or an unknown modifier is not a Side, and groups still sum to the lines", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "o1", state: "COMPLETED", closed_at: "2026-10-18T02:05:00Z", total_money: money(3 * (26.9 + 2 * 6)), total_tip_money: money(0),
      line_items: [
        // Three Ricotta Hotcakes at $26.90, each with two bacon ($6): 6 side units, $36
        { name: "Ricotta Hotcakes.", quantity: "3", total_money: money(3 * (26.9 + 2 * 6)), catalog_object_id: "v-hot",
          modifiers: [
            { catalog_object_id: "m-bacon", name: "Bacon.", quantity: "2", base_price_money: money(6), total_price_money: money(36) },
            { catalog_object_id: "m-gf", name: "Gluten free", quantity: "1", base_price_money: money(0) },
            // Not in the catalogue lookup at all (deleted modifier): stays on the dish
            { catalog_object_id: "m-mystery", name: "Extra", quantity: "1", base_price_money: money(4) },
            // No catalogue id at all
            { name: "Ad hoc side", quantity: "1", base_price_money: money(5) },
          ] },
      ] },
  ]
  const modList = (id?: string) => ({ "m-bacon": "Food Sides", "m-gf": "Food Sides" } as Record<string, string>)[id ?? ""]
  const b = computeDayBreakdown("2026-10-18", orders, [], () => ({ reportingCategory: "Cafe Food" }), () => undefined, null, modList)
  const sides = b.groups.find((g) => g.name === "Sides")!
  const food = b.groups.find((g) => g.name === "Cafe Food")!
  assert.equal(sides.sales, 36); assert.equal(sides.qty, 6)
  assert.deepEqual(sides.topItems, [{ name: "Bacon", qty: 6, sales: 36 }])
  assert.equal(food.sales, 80.7); assert.equal(food.qty, 3); assert.equal(food.countedUnderSides, 36)
  assert.deepEqual(food.topItems, [{ name: "Ricotta Hotcakes", qty: 3, sales: 80.7 }])
  assert.equal(Math.round((sides.sales + food.sales) * 100) / 100, 116.7)
  // Sides do not touch the money totals
  assert.equal(b.paidIncGst, 116.7); assert.equal(b.paidOrders, 1)
})

test("computeDayBreakdown: a line with quantity 0 or a null modifier price moves nothing to Sides", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "o1", state: "COMPLETED", closed_at: "2026-10-18T02:05:00Z", total_money: money(26.9), total_tip_money: money(0),
      line_items: [
        { name: "Eggs", quantity: "0", total_money: money(0), catalog_object_id: "v-eggs",
          modifiers: [{ catalog_object_id: "m-bacon", name: "Bacon", quantity: "1", base_price_money: money(6) }] },
        { name: "Toast", quantity: "1", total_money: money(26.9), catalog_object_id: "v-toast",
          modifiers: [{ catalog_object_id: "m-avo", name: "Avo", quantity: "1" }] },
      ] },
  ]
  const b = computeDayBreakdown("2026-10-18", orders, [], () => ({ reportingCategory: "Cafe Food" }), () => undefined, null, () => "Food Sides")
  // A qty-0 line leaves an empty Sides row ($0, 0 items) rather than none; harmless, noted in the guard report
  assert.equal(b.groups.find((g) => g.name === "Sides")?.sales ?? 0, 0)
  assert.equal(b.groups.find((g) => g.name === "Sides")?.qty ?? 0, 0)
  const food = b.groups.find((g) => g.name === "Cafe Food")!
  assert.equal(food.sales, 26.9); assert.equal(food.qty, 1); assert.equal(food.countedUnderSides, undefined)
  assert.equal(b.paidIncGst, 26.9)
})

test("computeDayBreakdown: a side on an open (unpaid) table is not counted anywhere yet", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "t1", state: "OPEN", created_at: "2026-10-18T02:05:00Z", total_money: money(32), tenders: [], ticket_name: "T1",
      line_items: [{ name: "Eggs", quantity: "1", total_money: money(32), catalog_object_id: "v-eggs",
        modifiers: [{ catalog_object_id: "m-bacon", name: "Bacon", quantity: "1", base_price_money: money(6) }] }] },
  ]
  const b = computeDayBreakdown("2026-10-18", orders, [], () => ({ reportingCategory: "Cafe Food" }), () => undefined, null, () => "Food Sides")
  assert.deepEqual(b.groups, [])
  assert.equal(b.openTablesIncGst, 32); assert.equal(b.paidIncGst, 0)
})

test("reportingGroup: blank and whitespace-only categories are Uncategorised; a modifier list name that is not Food Sides is not Sides", () => {
  assert.equal(reportingGroup(""), "Uncategorised")
  assert.equal(reportingGroup("   "), "Uncategorised")
  assert.equal(reportingGroup("Sides"), "Sides")
})

test("computeDayBreakdown: a refund given today comes off gross sales even when the sale it refunds is not in today's orders", () => {
  // Beach House 21 Oct 2026 in miniature: $9,696.45 of orders, an $8.60 tip
  // inside one of them, and a $19 return order with zero totals of its own.
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "a", state: "COMPLETED", closed_at: "2026-10-21T00:00:00Z", total_money: money(9000), total_tip_money: money(8.6), source: { name: "Point of Sale" },
      line_items: [{ name: "Day", quantity: "1", total_money: money(8991.4), catalog_object_id: "v-day" }] },
    { id: "b", state: "COMPLETED", closed_at: "2026-10-21T03:00:00Z", total_money: money(705.05), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Night", quantity: "1", total_money: money(705.05), catalog_object_id: "v-night" }] },
    // Refund of yesterday's sale at 2pm: Square counts it against today
    { id: "r", state: "COMPLETED", closed_at: "2026-10-21T04:00:00Z", total_money: money(0), total_tip_money: money(0), line_items: [], returns: [{ source_order_id: "yesterday" }], return_amounts: { total_money: money(19), tax_money: money(1.73) } },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "a", source_type: "CARD", amount_money: money(9008.6), device_details: { device_name: "Register 1 - Cafe" } },
    { id: "p2", status: "COMPLETED", order_id: "b", source_type: "CARD", amount_money: money(705.05), device_details: { device_name: "HH 4 - RESTAURANT" } },
  ]
  const b = computeDayBreakdown("2026-10-21", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 9677.45)
  assert.equal(b.returnsIncGst, 19)
  assert.equal(b.tipsIncGst, 8.6)
  assert.equal(b.paidOrders, 2)
  assert.equal(b.hourly[14], -19)
  assert.equal(Math.round(b.hourly.reduce((s, v) => s + v, 0) * 100) / 100, 9677.45)
  // The refunded sale is not in today's payments, so no channel is adjusted
  assert.deepEqual(b.channels.CAFE, { sales: 8991.4, orders: 1 })
  assert.deepEqual(b.channels.RESTAURANT, { sales: 705.05, orders: 1 })
  assert.equal(b.unmatchedPayments, 0)
})

test("computeDayBreakdown: a return order whose own total is negative is not taken off twice", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "a", state: "COMPLETED", closed_at: "2026-10-21T00:00:00Z", total_money: money(100), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Day", quantity: "1", total_money: money(100), catalog_object_id: "v-day" }] },
    { id: "r", state: "COMPLETED", closed_at: "2026-10-21T01:00:00Z", total_money: money(-19), line_items: [], returns: [{ source_order_id: "a" }], return_amounts: { total_money: money(19) } },
    // A return order with nothing in it changes nothing
    { id: "r0", state: "COMPLETED", closed_at: "2026-10-21T01:00:00Z", total_money: money(0), line_items: [], returns: [{}], return_amounts: { total_money: money(0) } },
  ]
  const b = computeDayBreakdown("2026-10-21", orders, [], () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 81)
  assert.equal(b.returnsIncGst, 19)
  assert.equal(b.paidOrders, 1)
})

test("computeDayBreakdown: the surcharge is what it added to the bill inc GST (applied_money), total_money only as a fallback", () => {
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "s1", state: "COMPLETED", closed_at: "2026-10-18T01:00:00Z", total_money: money(178.15), total_tip_money: money(0), source: { name: "Point of Sale" },
      service_charges: [{ name: "Sunday Surcharge", applied_money: money(16.2), total_money: money(14.73) }],
      line_items: [{ name: "Lunch", quantity: "1", total_money: money(161.95), catalog_object_id: "v-lunch" }] },
    { id: "s2", state: "COMPLETED", closed_at: "2026-10-18T02:00:00Z", total_money: money(55), total_tip_money: money(0), source: { name: "Point of Sale" },
      service_charges: [{ name: "Sunday Surcharge", total_money: money(5) }],
      line_items: [{ name: "Brunch", quantity: "1", total_money: money(50), catalog_object_id: "v-brunch" }] },
  ]
  const b = computeDayBreakdown("2026-10-18", orders, [], () => undefined, () => undefined)
  assert.equal(b.surchargeIncGst, 21.2)
  assert.equal(b.paidIncGst, 233.15)
})

test("computeDayBreakdown: a refund bigger than the day's sales goes negative rather than clamping, and empty or null return shells change nothing", () => {
  // Thursday morning at Burleigh: one $26.90 brekkie, then a $60 refund of a
  // table from the night before, rung against the same register's sale.
  const orders: Array<SquareOrder & Record<string, unknown>> = [
    { id: "s1", state: "COMPLETED", closed_at: "2026-10-22T00:00:00Z", total_money: money(26.9), total_tip_money: money(0), source: { name: "Point of Sale" },
      line_items: [{ name: "Chilli Benny (Bacon)", quantity: "1", total_money: money(26.9), catalog_object_id: "v-benny" }] },
    { id: "r1", state: "COMPLETED", closed_at: "2026-10-22T04:00:00Z", total_money: money(0), line_items: [], returns: [{ source_order_id: "s1" }], return_amounts: { total_money: money(60), tax_money: money(5.45) } },
    // Return shell with no amounts at all (null return_amounts, no totals): ignored
    { id: "r2", state: "COMPLETED", closed_at: "2026-10-22T04:10:00Z", returns: [{ source_order_id: "s1" }] },
    // Return shell with a zero amount: ignored
    { id: "r3", state: "COMPLETED", closed_at: "2026-10-22T04:20:00Z", total_money: money(0), line_items: [], returns: [{}], return_amounts: { total_money: money(0) } },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "s1", source_type: "CARD", amount_money: money(26.9), created_at: "2026-10-22T00:00:00Z", device_details: { device_name: "Register 1 - Cafe" } },
  ]
  const b = computeDayBreakdown("2026-10-22", orders, payments, () => undefined, () => undefined)
  assert.equal(b.paidIncGst, -33.1)
  assert.equal(b.returnsIncGst, 60)
  assert.equal(b.paidOrders, 1)
  assert.equal(b.avgTransaction, -33.1)
  assert.equal(b.hourly[10], 26.9)
  assert.equal(b.hourly[14], -60)
  assert.equal(Math.round(b.hourly.reduce((s, v) => s + v, 0) * 100) / 100, -33.1)
  assert.equal(b.hourlyOrders.reduce((s, n) => s + n, 0), 1)
  // The refunded sale was paid on the cafe register today, so the cafe channel wears it
  assert.deepEqual(b.channels.CAFE, { sales: -33.1, orders: 1 })
  assert.deepEqual(b.channels.RESTAURANT, { sales: 0, orders: 0 })
  assert.equal(b.registers.find((r) => r.name === "Register 1 - Cafe")?.sales, 26.9)
  assert.equal(b.unmatchedPayments, 0)
})
