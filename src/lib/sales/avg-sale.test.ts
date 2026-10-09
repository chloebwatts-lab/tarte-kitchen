import { test } from "node:test"
import assert from "node:assert/strict"
import { buildAvgBoard, weekMinOrders, DAY_MIN_ORDERS, WEEK_MIN_ORDERS, type StaffSalesRow } from "./avg-sale"

const row = (date: string, id: string, name: string, channel: string, sales: number, orders: number): StaffSalesRow => ({ date, teamMemberId: id, staffName: name, channel, sales, orders })

test("ranks by average sale, only on the chosen channel, once someone has enough sales", () => {
  const b = buildAvgBoard(
    [
      row("2026-10-09", "h", "Hannah Susman", "CAFE", 612.5, 51),   // 12.01
      row("2026-10-09", "b", "Baily Roberts", "CAFE", 243.2, 16),   // 15.20
      row("2026-10-09", "n", "Nadia Hadid", "CAFE", 52.8, 3),       // 17.60 but only 3 sales
      row("2026-10-09", "p", "Pauline Stefani", "RESTAURANT", 1950, 24), // other channel
    ],
    "CAFE", DAY_MIN_ORDERS
  )
  assert.deepEqual(b.rows.map((r) => [r.name, r.avg, r.rank]), [["Baily Roberts", 15.2, 1], ["Hannah Susman", 12.01, 2], ["Nadia Hadid", 17.6, null]])
  assert.equal(b.teamOrders, 70)
  assert.equal(b.teamSales, 908.5)
  assert.equal(b.teamAvg, 12.98)
  assert.equal(b.rows[0].vsTeam, 2.22)
  assert.equal(b.rows[1].vsTeam, -0.97)
})

test("a week adds a person's days together; ties share a rank; the same average on fewer sales sorts second", () => {
  const b = buildAvgBoard(
    [
      row("2026-10-05", "h", "Hannah Susman", "CAFE", 300, 25),
      row("2026-10-06", "h", "Hannah Susman", "CAFE", 180, 15), // 480/40 = 12.00
      row("2026-10-05", "b", "Baily Roberts", "CAFE", 360, 30),  // 12.00
      row("2026-10-05", "c", "Carmen Taylor", "CAFE", 286, 26),  // 11.00
    ],
    "CAFE", WEEK_MIN_ORDERS
  )
  assert.deepEqual(b.rows.map((r) => [r.name, r.orders, r.rank]), [["Hannah Susman", 40, 1], ["Baily Roberts", 30, 1], ["Carmen Taylor", 26, 3]])
})

test("empty day, zero-order rows and a channel nobody sold on give an empty board, no division by zero", () => {
  assert.deepEqual(buildAvgBoard([], "CAFE", 10), { channel: "CAFE", rows: [], teamSales: 0, teamOrders: 0, teamAvg: 0, minOrders: 10 })
  const b = buildAvgBoard([row("2026-10-09", "h", "Hannah Susman", "CAFE", 0, 0), row("2026-10-09", "p", "Pauline Stefani", "RESTAURANT", 90, 2)], "CAFE", 10)
  assert.equal(b.rows.length, 0)
  assert.equal(b.teamAvg, 0)
})

test("week minimum ramps: 10 on day one, 15 on day two, capped at 25", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 7].map(weekMinOrders), [10, 15, 20, 25, 25, 25])
})
