import { test, describe } from "node:test"
import assert from "node:assert/strict"
import {
  LEARN_MIN_NIGHTS,
  carriedRequest,
  compareRunItems,
  doneInEarlierRun,
  isCarryoverLine,
  moveRank,
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

// ─── Added by test-guard, 15 Oct 2026 ───────────────────────────────────────

describe("carry-over arithmetic on fractional kitchen quantities", () => {
  test("outstanding and carried amounts round to 2dp, no float dust", () => {
    // 1 tray asked, 0.9 made: 0.1 left (1 - 0.9 is 0.09999... in floats)
    assert.equal(outstandingQty(1, 0.9), 0.1)
    // 3 asked, 0.1 + 0.2 made
    assert.equal(outstandingQty(3, 0.1 + 0.2), 2.7)
    assert.equal(carriedRequest(0.1, { requested: 0.2, doneEarlier: false }), 0.3)
    assert.equal(carriedRequest(1.1, { requested: 2.2, doneEarlier: false }), 3.3)
    // Half a batch onto a sheet already asking for a quarter and a half
    assert.equal(carriedRequest(0.5, { requested: 0.75, doneEarlier: false }), 1.25)
  })

  test("nasty inputs: negative or dust-sized requests carry nothing", () => {
    assert.equal(outstandingQty(-2, null), 0)
    assert.equal(outstandingQty(0.004, null), 0, "rounds away to nothing")
    assert.equal(isCarryoverLine({ requested: -2, supplied: null, carriedAt: null, droppedAt: null }), false)
    assert.equal(isCarryoverLine({ requested: 0, supplied: null, carriedAt: null, droppedAt: null }), false)
    // Over-delivered line is settled, never a negative carry
    assert.equal(isCarryoverLine({ requested: 2, supplied: 2.5, carriedAt: null, droppedAt: null }), false)
  })

  test("carrying onto today's line that asks for nothing yet, or was already made, uses the outstanding amount only", () => {
    assert.equal(carriedRequest(2, { requested: 0, doneEarlier: false }), 2)
    assert.equal(carriedRequest(2, { requested: null, doneEarlier: true }), 2)
    assert.equal(carriedRequest(0, { requested: 3, doneEarlier: false }), 3, "nothing outstanding adds nothing")
  })
})

describe("priority numbers: sequences and odd ranks", () => {
  test("a plain list is one sequence whatever the category; a sectioned list keys on the section", () => {
    assert.equal(rankSequence(false, "Café"), "ALL")
    assert.equal(rankSequence(false, "Station restock"), "ALL")
    assert.equal(rankSequence(true, "Café"), "Café")
    assert.notEqual(rankSequence(true, "Restaurant"), rankSequence(true, "Café"))
  })

  test("zero and negative ranks never pull the next number below 1; any iterable works", () => {
    assert.equal(nextPriorityRank([0, -3]), 1)
    assert.equal(nextPriorityRank(new Set([2, 7])), 8)
    assert.equal(nextPriorityRank([2.5]), 3.5, "odd data passes through rather than being hidden")
  })
})

describe("make prep order with priorities and plain items mixed", () => {
  const item = (name: string, category: string, rank: number | null, neededBy: string | null = null, priority = rank != null) => ({
    name,
    category,
    priority,
    priorityRank: rank,
    neededBy,
  })
  const early = "2026-10-16T00:00:00.000Z"
  const later = "2026-10-16T04:00:00.000Z"

  test("sectioned: every priority, from any section, sits above every plain item, deadline or not", () => {
    const items = [
      item("Lemons", "Restaurant", null, early),
      item("Pico", "Café", 1),
      item("Burger buns", "Café", null, later),
      item("Hollandaise", "Restaurant", null),
      item("Goat cream", "Main prep", null, later),
      item("W.C.", "Café", null),
      item("Star only", "Restaurant", null, null, true),
    ]
    const out = [...items].sort(compareRunItems(true)).map((i) => i.name)
    // Restaurant star (no number) leads Café 1: sections run in order before numbers.
    // Plain items: deadlines first (earliest, then by section for a tie), then section order, then name.
    assert.deepEqual(out, ["Star only", "Pico", "Lemons", "Burger buns", "Goat cream", "Hollandaise", "W.C."])
  })

  test("sectioned: within one section a numbered item beats a bare star, and a deadline beats both", () => {
    const items = [
      item("Bare star", "Restaurant", null, null, true),
      item("Steak", "Restaurant", 2),
      item("Parsley oil", "Restaurant", 1),
      item("Stock", "Restaurant", 3, later),
    ]
    const out = [...items].sort(compareRunItems(true)).map((i) => i.name)
    assert.deepEqual(out, ["Stock", "Parsley oil", "Steak", "Bare star"])
  })

  test("plain list: two items with the same number and section fall back to name, never swap unpredictably", () => {
    const a = item("Aioli", "Station restock", 1)
    const b = item("Buns", "Station restock", 1)
    assert.equal(Math.sign(compareRunItems(false)(a, b)), -1)
    assert.equal(Math.sign(compareRunItems(false)(b, a)), 1)
    assert.equal(compareRunItems(false)(a, { ...a }), 0)
  })

  test("the comparator is antisymmetric across every pair, sectioned and plain", () => {
    const sample = [
      item("Lemons", "Restaurant", null, early),
      item("Pico", "Café", 1),
      item("Buns", "Café", null, later),
      item("Hollandaise", "Restaurant", null),
      item("Star", "Restaurant", null, null, true),
      item("Stock", "Restaurant", 3, later),
      item("Burger ball", "Production", 1),
      item("Goat cream", "Main kitchen larder", 2, early),
    ]
    for (const sectioned of [true, false]) {
      const cmp = compareRunItems(sectioned)
      for (const a of sample) {
        for (const b of sample) {
          assert.equal(Math.sign(cmp(a, b)) + Math.sign(cmp(b, a)), 0, `${a.name} vs ${b.name} (sectioned=${sectioned})`)
        }
      }
    }
  })
})

describe("moving a priority number by hand (Chloe, 15 Oct 2026)", () => {
  const lines = [
    { id: "buns", priorityRank: 1 },
    { id: "pico", priorityRank: 2 },
    { id: "wc", priorityRank: 3 },
    { id: "lemons", priorityRank: null },
  ]

  test("a 2 moved to 3 swaps with the old 3, nothing else changes", () => {
    assert.deepEqual(moveRank(lines, "pico", 3), [
      { id: "wc", priorityRank: 2 },
      { id: "pico", priorityRank: 3 },
    ])
  })

  test("a 3 moved to 1 pushes the others down one", () => {
    assert.deepEqual(moveRank(lines, "wc", 1), [
      { id: "wc", priorityRank: 1 },
      { id: "buns", priorityRank: 2 },
      { id: "pico", priorityRank: 3 },
    ])
  })

  test("an unnumbered prep given a number joins the sequence there", () => {
    assert.deepEqual(moveRank(lines, "lemons", 2), [
      { id: "lemons", priorityRank: 2 },
      { id: "pico", priorityRank: 3 },
      { id: "wc", priorityRank: 4 },
    ])
  })

  test("a number past the end puts it last, zero puts it first, same number is a no-op", () => {
    assert.deepEqual(moveRank(lines, "buns", 99), [
      { id: "pico", priorityRank: 1 },
      { id: "wc", priorityRank: 2 },
      { id: "buns", priorityRank: 3 },
    ])
    assert.deepEqual(moveRank(lines, "wc", 0), [
      { id: "wc", priorityRank: 1 },
      { id: "buns", priorityRank: 2 },
      { id: "pico", priorityRank: 3 },
    ])
    assert.deepEqual(moveRank(lines, "pico", 2), [])
  })

  test("gaps close: a list numbered 1, 5, 9 comes back 1, 2, 3", () => {
    const gappy = [
      { id: "a", priorityRank: 1 },
      { id: "b", priorityRank: 5 },
      { id: "c", priorityRank: 9 },
    ]
    assert.deepEqual(moveRank(gappy, "c", 3), [
      { id: "b", priorityRank: 2 },
      { id: "c", priorityRank: 3 },
    ])
  })

  test("an unknown id changes nothing", () => {
    assert.deepEqual(moveRank(lines, "nope", 1), [])
  })
})
