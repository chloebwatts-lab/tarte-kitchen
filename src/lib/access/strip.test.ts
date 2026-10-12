import { test, describe } from "node:test"
import assert from "node:assert/strict"
import type { PrepSheet } from "@/lib/actions/prep-sheet"
import { stripPrepNumbers } from "./strip"

const sheet: PrepSheet = {
  forDate: "2026-10-13",
  venue: "BURLEIGH",
  lookbackWeeks: 8,
  totalCost: 184.2,
  lines: [
    {
      preparationId: "prep-hollandaise",
      preparationName: "Hollandaise",
      category: "Sauces",
      requiredBaseQty: 2400,
      baseUnit: "ml",
      batchesNeeded: 3,
      yieldPerBatch: 1,
      yieldUnit: "L",
      batchCost: 38.4,
      totalCost: 115.2,
      drivers: [
        { dishName: "Eggs Benedict", venue: "BURLEIGH", forecastQty: 42 },
        { dishName: "Smashed Avo", venue: "BURLEIGH", forecastQty: 18 },
      ],
    },
    {
      preparationId: "prep-croissant-dough",
      preparationName: "Croissant dough",
      category: "Pastry",
      requiredBaseQty: 6000,
      baseUnit: "g",
      batchesNeeded: 2,
      yieldPerBatch: 3,
      yieldUnit: "kg",
      batchCost: 34.5,
      totalCost: 69,
      drivers: [{ dishName: "Almond croissant", venue: "BURLEIGH", forecastQty: 60 }],
    },
  ],
  unmatchedForecast: [{ menuItemName: "Lamington", forecastQty: 12, venue: "BURLEIGH" }],
}

describe("prep sheet for a below-Manager sign-in", () => {
  const out = stripPrepNumbers(sheet)

  test("every dollar figure and every forecast is zero", () => {
    assert.equal(out.totalCost, 0)
    for (const l of out.lines) {
      assert.equal(l.batchCost, 0)
      assert.equal(l.totalCost, 0)
      for (const d of l.drivers) assert.equal(d.forecastQty, 0)
    }
    for (const u of out.unmatchedForecast) assert.equal(u.forecastQty, 0)
  })

  test("the prep list itself is untouched: same preps, quantities, batches and dish names", () => {
    assert.deepEqual(
      out.lines.map((l) => [l.preparationName, l.requiredBaseQty, l.batchesNeeded, l.drivers.map((d) => d.dishName)]),
      sheet.lines.map((l) => [l.preparationName, l.requiredBaseQty, l.batchesNeeded, l.drivers.map((d) => d.dishName)])
    )
    assert.equal(out.forDate, sheet.forDate)
    assert.equal(out.venue, sheet.venue)
  })

  test("does not mutate the sheet a manager would get", () => {
    assert.equal(sheet.totalCost, 184.2)
    assert.equal(sheet.lines[0].drivers[0].forecastQty, 42)
    assert.equal(sheet.unmatchedForecast[0].forecastQty, 12)
  })

  test("an empty sheet stays empty", () => {
    const empty = stripPrepNumbers({ ...sheet, totalCost: 0, lines: [], unmatchedForecast: [] })
    assert.deepEqual(empty.lines, [])
    assert.deepEqual(empty.unmatchedForecast, [])
  })
})
