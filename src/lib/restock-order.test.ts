import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  LEARN_MIN_NIGHTS,
  carriedRequest,
  compareRunItems,
  doneInEarlierRun,
  isCarryoverLine,
  nextPriorityRank,
  orderPrepItems,
  outstandingQty,
  rankSequence,
} from "./restock-order"

const items = [
  { id: "a", name: "Chives", category: "Main kitchen grill", sortOrder: 1 },
  { id: "b", name: "Guacamole", category: "Main kitchen grill", sortOrder: 2 },
  { id: "c", name: "Hollandaise", category: "Main kitchen grill", sortOrder: 3 },
  { id: "d", name: "Burger Ball", category: "Production", sortOrder: 1 },
  { id: "e", name: "Goat Cream", category: "Main kitchen larder", sortOrder: 1 },
]
const counts = new Map([["c", 20], ["b", 5], ["d", 30]])

describe("prep list order", () => {
  test("paper order until there is enough history", () => {
    const out = orderPrepItems(items, counts, LEARN_MIN_NIGHTS - 1)
    assert.deepEqual(out.map((i) => i.id), ["a", "b", "c", "e", "d"])
  })

  test("most requested first inside each section, sections never mix", () => {
    const out = orderPrepItems(items, counts, LEARN_MIN_NIGHTS)
    assert.deepEqual(out.map((i) => i.id), ["c", "b", "a", "e", "d"])
  })

  test("ties and never-requested items keep the paper order", () => {
    const out = orderPrepItems(items, new Map([["a", 3], ["b", 3]]), 30)
    assert.deepEqual(out.slice(0, 3).map((i) => i.id), ["a", "b", "c"])
  })
})

describe("lines on a sheet reopened after the morning run", () => {
  const run = new Date("2026-10-04T18:21:47Z")
  test("made before the run finished: history, stays off the next run", () => {
    assert.equal(doneInEarlierRun(new Date("2026-10-04T18:21:10Z"), run), true)
  })
  test("not made yet, or made after the sheet was reopened: still on the run", () => {
    assert.equal(doneInEarlierRun(null, run), false)
    assert.equal(doneInEarlierRun(new Date("2026-10-05T19:00:00Z"), run), false)
    assert.equal(doneInEarlierRun(new Date("2026-10-04T18:00:00Z"), null), false)
  })
})

describe("priority numbers restart per section (Jose, 15 Oct 2026)", () => {
  test("next number is one past the highest taken, gaps included", () => {
    assert.equal(nextPriorityRank([]), 1)
    assert.equal(nextPriorityRank([null, undefined]), 1)
    assert.equal(nextPriorityRank([1, 2, 3]), 4)
    assert.equal(nextPriorityRank([1, null, 5]), 6)
  })

  test("burger buns are Café's number 1 even with 17 Restaurant priorities", () => {
    const lines = [
      ...Array.from({ length: 17 }, (_, i) => ({ category: "Restaurant", priorityRank: i + 1 })),
      { category: "Café", priorityRank: null },
    ]
    const cafe = lines.filter((l) => rankSequence(true, l.category) === rankSequence(true, "Café"))
    assert.equal(nextPriorityRank(cafe.map((l) => l.priorityRank)), 1)
    // A plain list (Tea Garden) keeps one sequence across everything
    const all = lines.filter((l) => rankSequence(false, l.category) === rankSequence(false, "Café"))
    assert.equal(nextPriorityRank(all.map((l) => l.priorityRank)), 18)
  })
})

describe("make prep order", () => {
  const item = (name: string, category: string, rank: number | null, neededBy: string | null = null, priority = rank != null) => ({
    name,
    category,
    priority,
    priorityRank: rank,
    neededBy,
  })

  test("sectioned: priorities run section by section, numbers restarting", () => {
    const items = [
      item("Pico", "Café", 2),
      item("Steak", "Restaurant", 2),
      item("Buns", "Café", 1),
      item("Parsley oil", "Restaurant", 1),
      item("Lemons", "Restaurant", null),
      item("W.C.", "Café", null),
    ]
    const out = [...items].sort(compareRunItems(true)).map((i) => i.name)
    assert.deepEqual(out, ["Parsley oil", "Steak", "Buns", "Pico", "Lemons", "W.C."])
  })

  test("sectioned: a deadline still leads its own section, never another's", () => {
    const items = [
      item("Buns", "Café", 1),
      item("Steak", "Restaurant", 3, "2026-10-16T00:00:00.000Z"),
      item("Parsley oil", "Restaurant", 1),
    ]
    const out = [...items].sort(compareRunItems(true)).map((i) => i.name)
    assert.deepEqual(out, ["Steak", "Parsley oil", "Buns"])
  })

  test("plain list: one sequence, earliest deadline first, stars without a number last", () => {
    const items = [
      item("B", "Station restock", 2),
      item("Star", "Station restock", null, null, true),
      item("A", "Station restock", 1),
      item("Late", "Station restock", 4, "2026-10-16T00:00:00.000Z"),
      item("Plain", "Station restock", null),
    ]
    const out = [...items].sort(compareRunItems(false)).map((i) => i.name)
    assert.deepEqual(out, ["Late", "A", "B", "Star", "Plain"])
  })
})

describe("carry-over of prep left unmade", () => {
  test("outstanding is requested less supplied, never negative", () => {
    assert.equal(outstandingQty(4, null), 4)
    assert.equal(outstandingQty(4, 1.5), 2.5)
    assert.equal(outstandingQty(4, 4), 0)
    assert.equal(outstandingQty(4, 6), 0)
    assert.equal(outstandingQty(null, null), 0)
    assert.equal(outstandingQty(0, null), 0)
  })

  test("a line carries over only while nothing has been decided about it", () => {
    const base = { requested: 3, supplied: 1, carriedAt: null, droppedAt: null }
    assert.equal(isCarryoverLine(base), true)
    assert.equal(isCarryoverLine({ ...base, supplied: 3 }), false)
    assert.equal(isCarryoverLine({ ...base, carriedAt: new Date() }), false)
    assert.equal(isCarryoverLine({ ...base, droppedAt: new Date() }), false)
    assert.equal(isCarryoverLine({ ...base, requested: null }), false)
  })

  test("bringing a line in adds to today's request, or restarts one already made", () => {
    assert.equal(carriedRequest(2, null), 2)
    assert.equal(carriedRequest(2, { requested: 3, doneEarlier: false }), 5)
    assert.equal(carriedRequest(2, { requested: null, doneEarlier: false }), 2)
    assert.equal(carriedRequest(2, { requested: 3, doneEarlier: true }), 2)
    assert.equal(carriedRequest(0.5, { requested: 0.25, doneEarlier: false }), 0.75)
  })
})
