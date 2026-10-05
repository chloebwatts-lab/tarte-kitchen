import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { buildSimpleBoard, weekMinHours, type DayRow } from "./challenge-simple"

const row = (date: string, id: string, staffName: string, units: number, breakdown: Record<string, number> | null = null): DayRow => ({ date, teamMemberId: id, staffName, units, eligibleOrders: 10, breakdown })

describe("simple challenge board", () => {
  test("a day ranks on sides sold; ties share a place; online is team only", () => {
    const b = buildSimpleBoard(
      [row("2026-10-05", "a", "Pauline Stefani", 12), row("2026-10-05", "b", "Baily Roberts", 12), row("2026-10-05", "c", "Carmen Taylor", 5), row("2026-10-05", "ONLINE", "Bopple / no staff member", 7)],
      new Map(), [], "UNITS"
    )
    assert.deepEqual(b.rows.map((r) => [r.name, r.rank]), [["Baily Roberts", 1], ["Pauline Stefani", 1], ["Carmen Taylor", 3]])
    assert.equal(b.onlineUnits, 7)
    assert.equal(b.teamUnits, 36)
  })

  test("managers count nine hours for every day they sold on, whatever the timesheet says", () => {
    const b = buildSimpleBoard(
      [row("2026-10-05", "m", "Matthew Scott", 27), row("2026-10-06", "m", "Matthew Scott", 18), row("2026-10-05", "p", "Pauline Stefani", 20)],
      new Map([["Matthew", 3.5], ["Pauline Stefani", 8]]), ["matthew scott"], "PER_HOUR"
    )
    const m = b.rows.find((r) => r.id === "m")!
    assert.equal(m.manager, true)
    assert.equal(m.hours, 18)
    assert.equal(m.perHour, 2.5)
    assert.deepEqual(b.rows.map((r) => r.id), ["m", "p"]) // 2.5 an hour each, the tie breaks on sides sold
    assert.equal(b.rows.find((r) => r.id === "p")!.perHour, 2.5)
  })

  test("the week ranks on sides per hour and needs 8 hours; no hours means no rank", () => {
    const b = buildSimpleBoard(
      [row("2026-10-05", "a", "Ava Brown", 13), row("2026-10-05", "g", "Georgia Madden", 26), row("2026-10-05", "x", "New Starter", 9)],
      new Map([["Ava brown", 4], ["Georgia Madden", 19.1]]), [], "PER_HOUR"
    )
    assert.deepEqual(b.rows.map((r) => [r.name, r.rank, r.perHour]), [["Georgia Madden", 1, 1.36], ["Ava Brown", null, 3.25], ["New Starter", null, null]])
  })

  test("the breakdown adds up across days, biggest first", () => {
    const b = buildSimpleBoard(
      [row("2026-10-05", "a", "Carmen Taylor", 5, { Bacon: 3, "Potato Hash": 2 }), row("2026-10-06", "a", "Carmen Taylor", 4, { "Potato Hash": 3, Avo: 1 })],
      new Map(), [], "UNITS"
    )
    assert.deepEqual(b.rows[0].items, [{ name: "Potato Hash", units: 5 }, { name: "Bacon", units: 3 }, { name: "Avo", units: 1 }])
  })

  test("day one of the week needs 4 hours to rank, 8 from day two", () => {
    assert.equal(weekMinHours(1), 4)
    assert.equal(weekMinHours(2), 8)
    assert.equal(weekMinHours(7), 8)
    const rows = [row("2026-10-05", "a", "Maz McKern", 18), row("2026-10-05", "b", "Chloe Johns", 9)]
    const hours = new Map([["Maz McKern", 4.5], ["Chloe Johns", 9.4]])
    assert.equal(buildSimpleBoard(rows, hours, [], "PER_HOUR", weekMinHours(1)).rows[0].name, "Maz McKern")
    assert.equal(buildSimpleBoard(rows, hours, [], "PER_HOUR", weekMinHours(2)).rows[0].name, "Chloe Johns")
  })
})
