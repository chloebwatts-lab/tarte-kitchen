import { test } from "node:test"
import assert from "node:assert/strict"
import { computeUpsell, leaderboard, matchHours, perHourBoard, DEFAULT_GROUPS, ONLINE_ID, MIN_ORDERS_FOR_ATTACH } from "./upsell"
import type { SquareOrder, SquarePayment } from "@/lib/square/client"

const money = (d: number) => ({ amount: Math.round(d * 100), currency: "AUD" })
const CAT: Record<string, string> = { eggs: "Restaurant Food", fries: "Cafe Food", capp: "Cafe Coffee & Tea", crois: "Pastries", oj: "Restaurant Drinks", wine: "Restaurant Wine & Beer", side: "Restaurant Food" }
const cat = (id?: string) => (id ? CAT[id] : undefined)
const NAMES: Record<string, string> = { baily: "Baily Roberts", pauline: "Pauline Stefani" }
const who = (id?: string) => (id ? NAMES[id] : undefined)

function order(id: string, staff: string | null, lines: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}): SquareOrder {
  return { id, state: "COMPLETED", total_money: money(10), line_items: lines as never, ...(staff ? { created_by_team_member_id: staff } : {}), source: { name: "Point of Sale" }, ...extra } as never
}
const pay = (id: string, orderId: string, device: string, staff?: string): SquarePayment =>
  ({ id, status: "COMPLETED", order_id: orderId, source_type: "CARD", amount_money: money(10), device_details: { device_name: device }, team_member_id: staff } as never)

test("sides: modifiers on a dish and standalone items count, sauces and GF do not", () => {
  const orders = [
    order("o1", "pauline", [
      { name: "Eggs Your Way", quantity: "2", catalog_object_id: "eggs", total_money: money(60), modifiers: [
        { name: "Bacon", quantity: "1", base_price_money: money(6.5), total_price_money: money(13) },
        { name: "Gluten Free", quantity: "1", base_price_money: money(3.5), total_price_money: money(7) },
        { name: "Miso Hollandaise", base_price_money: money(4), total_price_money: money(8) },
      ] },
      { name: "Orange Juice.", quantity: "2", catalog_object_id: "oj", total_money: money(22) },
    ]),
    order("o2", "pauline", [{ name: "Eggs Your Way", quantity: "1", catalog_object_id: "eggs", total_money: money(24) }]),
    order("o3", "baily", [{ name: "Fries.", quantity: "1", catalog_object_id: "fries", total_money: money(10.65) }, { name: "Cappuccino.", quantity: "1", catalog_object_id: "capp", total_money: money(6.9), modifiers: [{ name: "Extra Shot", base_price_money: money(0.5), total_price_money: money(0.5) }, { name: "Oat Milk", base_price_money: money(1), total_price_money: money(1) }] }]),
    order("o4", "baily", [{ name: "Cappuccino.", quantity: "1", catalog_object_id: "capp", total_money: money(6.9) }, { name: "Croissant", quantity: "1", catalog_object_id: "crois", total_money: money(9.5) }]),
  ]
  const payments = [pay("p1", "o1", "HH 4 - RESTAURANT", "pauline"), pay("p2", "o2", "HH 4 - RESTAURANT", "pauline"), pay("p3", "o3", "Register 3 - Cafe", "baily"), pay("p4", "o4", "Register 3 - Cafe", "baily")]
  const { rows, unassigned } = computeUpsell(orders, payments, cat, who, DEFAULT_GROUPS)
  const get = (staff: string, g: string) => rows.find((r) => r.teamMemberId === staff && r.groupKey === g)

  // Pauline: 2 food orders, one with bacon x2 (line qty 2)
  assert.deepEqual({ ...get("pauline", "sides") }, { teamMemberId: "pauline", staffName: "Pauline Stefani", groupKey: "sides", eligibleOrders: 2, ordersWith: 1, units: 2, sales: 13, breakdown: { Bacon: 2 } })
  // Baily: fries is a standalone side on a food order
  assert.equal(get("baily", "sides")!.units, 1); assert.equal(get("baily", "sides")!.eligibleOrders, 1); assert.equal(get("baily", "sides")!.sales, 10.65)
  // Coffee extras: extra shot counts, oat milk does not; 2 coffee orders, 1 with
  assert.deepEqual([get("baily", "coffee_extras")!.eligibleOrders, get("baily", "coffee_extras")!.ordersWith, get("baily", "coffee_extras")!.units], [2, 1, 1])
  // Pastry with coffee (cafe only): 2 coffee orders, 1 with a pastry
  assert.deepEqual([get("baily", "pastry_with_coffee")!.eligibleOrders, get("baily", "pastry_with_coffee")!.ordersWith], [2, 1])
  assert.equal(get("pauline", "pastry_with_coffee"), undefined)
  // Drinks with food (restaurant only): 2 food orders, 2 juices on one
  assert.deepEqual([get("pauline", "drinks_with_food")!.eligibleOrders, get("pauline", "drinks_with_food")!.ordersWith, get("pauline", "drinks_with_food")!.units], [2, 1, 2])
  assert.equal(get("baily", "drinks_with_food"), undefined)
  // Paid food add-ons nobody counts yet are surfaced (GF + sauce), cheapest/zero ones are not
  assert.deepEqual(unassigned.map((u) => u.name).sort(), ["Gluten Free", "Miso Hollandaise"])
})

test("Bopple and staffless orders land on ONLINE and never on a person; open unpaid tables are ignored", () => {
  const orders = [
    order("b1", null, [{ name: "Chicken Sandwich", quantity: "1", catalog_object_id: "fries", total_money: money(24), modifiers: [{ name: "Avo", base_price_money: money(6.5), total_price_money: money(6.5) }] }], { source: { name: "Bopple" }, state: "OPEN", tenders: [{ amount_money: money(10) }] }),
    order("t1", "pauline", [{ name: "Eggs Your Way", quantity: "1", catalog_object_id: "eggs", total_money: money(30), modifiers: [{ name: "Bacon", base_price_money: money(6.5), total_price_money: money(6.5) }] }], { state: "OPEN", tenders: [] }),
  ]
  const { rows } = computeUpsell(orders, [], cat, who, DEFAULT_GROUPS)
  assert.deepEqual(rows.map((r) => [r.teamMemberId, r.groupKey, r.units]), [[ONLINE_ID, "sides", 1]])
})

test("who gets credit: the person who opened the order, else whoever took payment", () => {
  const li = [{ name: "Eggs Your Way", quantity: "1", catalog_object_id: "eggs", total_money: money(30), modifiers: [{ name: "Avo", base_price_money: money(6.5), total_price_money: money(6.5) }] }]
  const orders = [order("a", "pauline", li), order("b", null, li)]
  const payments = [pay("p1", "a", "Register 3 - Cafe", "baily"), pay("p2", "b", "Register 3 - Cafe", "baily")]
  const { rows } = computeUpsell(orders, payments, cat, who, DEFAULT_GROUPS.filter((g) => g.key === "sides"))
  assert.deepEqual(rows.map((r) => [r.staffName, r.units]).sort(), [["Baily Roberts", 1], ["Pauline Stefani", 1]])
})

test("leaderboard: units ranks by volume, attach needs a minimum of eligible orders, team total includes Bopple", () => {
  const rows = [
    { teamMemberId: "a", staffName: "Ana", eligibleOrders: 100, ordersWith: 20, units: 25, sales: 160 },
    { teamMemberId: "b", staffName: "Baily", eligibleOrders: 40, ordersWith: 16, units: 18, sales: 120 },
    { teamMemberId: "c", staffName: "Casual", eligibleOrders: MIN_ORDERS_FOR_ATTACH - 1, ordersWith: 9, units: 9, sales: 60 },
    { teamMemberId: "d", staffName: "Dee", eligibleOrders: 30, ordersWith: 0, units: 0, sales: 0 },
    { teamMemberId: ONLINE_ID, staffName: "Bopple", eligibleOrders: 50, ordersWith: 5, units: 5, sales: 30 },
    { teamMemberId: "a", staffName: "Ana", eligibleOrders: 10, ordersWith: 2, units: 2, sales: 13 }, // second day
  ]
  const u = leaderboard(rows, "UNITS")
  assert.deepEqual(u.board.map((r) => [r.staffName, r.units, r.rank]), [["Ana", 27, 1], ["Baily", 18, 2], ["Casual", 9, 3], ["Dee", 0, null]])
  assert.equal(u.team.units, 59); assert.equal(u.team.eligibleOrders, 239)
  const a = leaderboard(rows, "ATTACH")
  assert.deepEqual(a.board.slice(0, 2).map((r) => [r.staffName, r.attachPct, r.rank]), [["Baily", 40, 1], ["Ana", 20, 2]])
  assert.equal(a.board.find((r) => r.staffName === "Casual")!.rank, null) // too few orders to rank on rate
  assert.equal(a.board.find((r) => r.staffName === "Ana")!.per100, 24.5)
  const s = leaderboard(rows, "SALES")
  assert.equal(s.board[0].staffName, "Ana"); assert.equal(s.board[0].sales, 173)
})

test("matchHours: exact, nickname with same surname, first-name-only when unambiguous", () => {
  const sheet = new Map<string, number>([
    ["Baily Roberts", 30.19], ["hannah susman", 15.46], ["Anastasia Iacovou", 17.37], ["Matthew", 27.05], ["Maz", 14.82],
    ["Georgie", 11.93], ["Georgia Rodney", 33.31], ["Georgia Madden", 19.11], ["Hannah", 5], ["Julian Mauricio", 41.39],
  ])
  const square = ["Baily Roberts", "Hannah Susman", "Ana Iacovou", "Matthew Scott", "Maz McKern", "Georgia Rodney", "Georgia Madden", "Hannah Summers", "Hannah Dell Vassiliou", "Tim Quintal"]
  const m = matchHours(square, sheet)
  assert.equal(m.get("Baily Roberts"), 30.19)
  assert.equal(m.get("Hannah Susman"), 15.46)
  assert.equal(m.get("Ana Iacovou"), 17.37)
  assert.equal(m.get("Matthew Scott"), 27.05)
  assert.equal(m.get("Maz McKern"), 14.82)
  assert.equal(m.get("Georgia Rodney"), 33.31)
  assert.equal(m.get("Georgia Madden"), 19.11)
  // "Hannah" alone could be either remaining Hannah: nobody gets those hours
  assert.equal(m.get("Hannah Summers"), undefined)
  assert.equal(m.get("Hannah Dell Vassiliou"), undefined)
  assert.equal(m.get("Tim Quintal"), undefined)
})

test("perHourBoard: ranks by sides per hour, needs minimum hours, missing hours stay unranked", () => {
  const { board } = leaderboard([
    { teamMemberId: "a", staffName: "Ana", eligibleOrders: 100, ordersWith: 20, units: 40, sales: 260 },
    { teamMemberId: "b", staffName: "Baily", eligibleOrders: 60, ordersWith: 20, units: 30, sales: 190 },
    { teamMemberId: "c", staffName: "Cameo", eligibleOrders: 12, ordersWith: 9, units: 10, sales: 60 },
    { teamMemberId: "d", staffName: "NoSheet", eligibleOrders: 30, ordersWith: 9, units: 12, sales: 70 },
  ], "PER_HOUR")
  const rows = perHourBoard(board, new Map([["Ana", 32], ["Baily", 15], ["Cameo", 3]]), 8)
  assert.deepEqual(rows.map((r) => [r.staffName, r.perHour, r.rank]), [["Baily", 2, 1], ["Ana", 1.25, 2], ["NoSheet", null, null], ["Cameo", 3.33, null]])
  assert.equal(rows[0].hours, 15)
})
