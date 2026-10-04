import { test } from "node:test"
import assert from "node:assert/strict"
import { computeDayBreakdown, channelForDevice, aestHour } from "./breakdown"
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
    { id: "r1", state: "COMPLETED", closed_at: "2026-10-04T02:30:00Z", total_money: money(0), returns: [{}], return_amounts: { total_money: money(30) }, line_items: [] },
  ]
  const payments: Array<SquarePayment & Record<string, unknown>> = [
    { id: "p1", status: "COMPLETED", order_id: "o1", source_type: "CARD", amount_money: money(35.18), device_details: { device_name: "Register 3 - Cafe" }, team_member_id: "tm-baily" },
    { id: "p2", status: "COMPLETED", order_id: "o2", source_type: "CARD", amount_money: money(110), device_details: { device_name: "HH 4 - RESTAURANT" }, team_member_id: "tm-pauline" },
    { id: "p3", status: "FAILED", order_id: "o2", source_type: "CARD", amount_money: money(110), device_details: { device_name: "Register 2 - Cafe" }, team_member_id: "tm-x" },
    { id: "p4", status: "COMPLETED", source_type: "CARD", amount_money: money(5) },
  ]
  const catalog = (id?: string) => ({ "v-smoothie": { reportingCategory: "Juice Bar" }, "v-croissant": { reportingCategory: "Pastries" }, "v-fish": { reportingCategory: "Restaurant Food" }, "v-sando": { reportingCategory: "Cafe Food" }, "v-wine": { reportingCategory: "Restaurant Wine & Beer" } } as Record<string, { reportingCategory: string }>)[id ?? ""]
  const team = (id?: string) => ({ "tm-baily": "Baily Roberts", "tm-pauline": "Pauline Stefani" } as Record<string, string>)[id ?? ""]

  const b = computeDayBreakdown("2026-10-04", orders, payments, catalog, team)
  // o1 35.18 + o2 (110 incl tip? total_money 100, tip 10 -> 90) + Bopple 41.5
  assert.equal(b.paidIncGst, 35.18 + 90 + 41.5)
  assert.equal(b.tipsIncGst, 10)
  assert.equal(b.paidOrders, 3)
  assert.equal(b.openTables, 1)
  assert.equal(b.openTablesIncGst, 180)
  assert.equal(b.surchargeIncGst, 1.68)
  assert.equal(b.surchargeName, "Sunday Surcharge")
  assert.equal(b.avgTransaction, Math.round(((35.18 + 90 + 41.5) / 3) * 100) / 100)
  // Hours: o1 23:05Z -> 9am, o2 01:30Z -> 11am, b1 created 00:10Z -> 10am
  assert.equal(b.hourly[9], 35.18); assert.equal(b.hourly[11], 90); assert.equal(b.hourly[10], 41.5)
  assert.equal(b.hourlyOrders.reduce((s, n) => s + n, 0), 3)
  assert.deepEqual(b.channels.CAFE, { sales: 35.18, orders: 1 })
  assert.deepEqual(b.channels.RESTAURANT, { sales: 90, orders: 1 })
  assert.deepEqual(b.channels.ONLINE, { sales: 41.5, orders: 1 })
  assert.equal(b.registers.find((r) => r.name === "Bopple")?.channel, "ONLINE")
  assert.equal(b.registers.find((r) => r.name === "Register 3 - Cafe")?.avgSale, 35.18)
  const pauline = b.staff.find((s) => s.name === "Pauline Stefani")!
  assert.equal(pauline.channel, "RESTAURANT"); assert.equal(pauline.sales, 90); assert.deepEqual(pauline.registers, ["HH 4 - RESTAURANT"])
  assert.equal(b.staff.find((s) => s.id === "tm-x"), undefined) // failed payment ignored
  const pastries = b.groups.find((g) => g.name === "Pastries")!
  assert.equal(pastries.qty, 2); assert.equal(pastries.sales, 20.5); assert.equal(pastries.topItems[0].name, "Croissant")
  assert.equal(b.groups.find((g) => g.name === "Restaurant Wine & Beer"), undefined) // open table not counted
  assert.equal(b.unmatchedPayments, 1)
})

test("computeDayBreakdown: empty day", () => {
  const b = computeDayBreakdown("2026-10-06", [], [], () => undefined, () => undefined)
  assert.equal(b.paidIncGst, 0); assert.equal(b.avgTransaction, 0); assert.deepEqual(b.groups, []); assert.equal(b.hourly.length, 24)
})
