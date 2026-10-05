import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { LEARN_MIN_NIGHTS, doneInEarlierRun, orderPrepItems } from "./restock-order"

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
