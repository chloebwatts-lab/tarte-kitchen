import { test } from "node:test"
import assert from "node:assert/strict"
import {
  AUTO_NAMES,
  isAutoRow,
  isHumanRow,
  matchProduct,
  splitAcrossBakes,
  buildBakeRows,
} from "./pastry-rotation-sync"

// -------------------------------------------------------------- auto rows

test("auto rows are only the known auto names; null staff name is human", () => {
  for (const n of AUTO_NAMES) assert.equal(isAutoRow(n), true, n)
  assert.equal(isAutoRow(null), false)
  assert.equal(isHumanRow(null), true)
  assert.equal(isAutoRow("Michelle"), false)
  assert.equal(isAutoRow("AUTO"), false, "case-sensitive on purpose")
  assert.equal(isHumanRow("JP"), false)
})

// ----------------------------------------------------------- matchProduct

test("tartes: specific berries before the generic berry -> strawberry fallback", () => {
  assert.equal(matchProduct("Blueberry Tarte"), "Blueberry tarte")
  assert.equal(matchProduct("Raspberry Tart"), "Raspberry tarte")
  assert.equal(matchProduct("Strawberry Tartes"), "Strawberry tarte")
  assert.equal(matchProduct("Mixed Berry Tart"), "Strawberry tarte")
  assert.equal(matchProduct("Rhubarb tarte"), "Rhubarb tarte")
  assert.equal(matchProduct("Passionfruit Tarte"), "Passionfruit tarte")
  assert.equal(matchProduct("Chocolate Tarte"), null, "unknown tarte flavour is not tracked")
})

test("croissants: almond, chocolate, plain; savoury ones are not tracked", () => {
  assert.equal(matchProduct("Croissant"), "Plain croissant")
  assert.equal(matchProduct("Almond Croissant"), "Almond croissant")
  assert.equal(matchProduct("Chocolate Croissant"), "Chocolate croissant")
  assert.equal(matchProduct("Choc Croissant"), "Chocolate croissant")
  assert.equal(matchProduct("Ham & Cheese Croissant"), null)
  assert.equal(matchProduct("Cheese Croissant"), null)
})

test("cruellers: flavour required, generic 'Cruellers' is skipped; both spellings work", () => {
  assert.equal(matchProduct("Cruellers"), null)
  assert.equal(matchProduct("Vanilla Crueller"), "Vanilla crueller")
  assert.equal(matchProduct("Vanilla Cruller"), "Vanilla crueller")
  assert.equal(matchProduct("Dulce de Leche Crueller"), "Dulce crueller")
  assert.equal(matchProduct("Cinnamon Cruller"), "Cinnamon crueller")
})

test("cookies, scrolls and the rest", () => {
  assert.equal(matchProduct("Dark Triple Choc Cookie"), "Dark triple chocolate cookie")
  assert.equal(matchProduct("Choc Chip Cookie"), "Choc chip cookie")
  assert.equal(matchProduct("Pistachio Cookie"), "Pistachio cookie")
  assert.equal(matchProduct("Cinnamon Scroll"), "Cinnamon scroll")
  assert.equal(matchProduct("Scroll - Cinnamon"), "Cinnamon scroll")
  assert.equal(matchProduct("Muffin Top"), "Muffin top")
  assert.equal(matchProduct("Kouign Amann"), "Kouign amann")
  assert.equal(matchProduct("Baked Cheesecake"), "Cheesecake")
  assert.equal(matchProduct("Lemon Butter Cake"), "Lemon butter cake")
  assert.equal(matchProduct("Pecan Pie"), "Pecan pie")
  assert.equal(matchProduct("Raspberry Friand"), "Friand")
})

// Any croissant flavour the matcher does not know falls through to "Plain
// croissant" (the bought-in Bridor line), so a pistachio or savoury-special
// croissant inflates plain sell-through. Recorded as todo, see report.
test("an unknown croissant flavour is not counted as a plain croissant", () => {
  assert.equal(matchProduct("Pistachio Croissant"), null)
  assert.equal(matchProduct("Plain Croissant"), "Plain croissant")
  assert.equal(matchProduct("Butter Croissant"), "Plain croissant")
  assert.equal(matchProduct("Croissants"), "Plain croissant")
})

test("non-pastry POS names are ignored", () => {
  assert.equal(matchProduct("Sourdough Loaf"), null)
  assert.equal(matchProduct("Flat White"), null)
  assert.equal(matchProduct("Custard Tart"), null)
  assert.equal(matchProduct("Starter Salad"), null, "'starter' must not match the tarte pattern")
  assert.equal(matchProduct(""), null)
})

test("punctuation and case are normalised", () => {
  assert.equal(matchProduct("  BLUEBERRY-TARTE (x2) "), "Blueberry tarte")
  assert.equal(matchProduct("Choc. Chip Cookie!!"), "Choc chip cookie")
})

// ------------------------------------------------------- splitAcrossBakes

test("largest-remainder split always sums to the total", () => {
  const props = [0.5, 0.3, 0.2]
  for (let total = 0; total <= 50; total++) {
    const parts = splitAcrossBakes(total, props)
    assert.equal(parts.reduce((a, b) => a + b, 0), total, `total ${total}`)
    assert.ok(parts.every((p) => p >= 0 && Number.isInteger(p)))
  }
})

test("largest-remainder split gives the leftover piece to the biggest fraction", () => {
  assert.deepEqual(splitAcrossBakes(10, [0.5, 0.3, 0.2]), [5, 3, 2])
  assert.deepEqual(splitAcrossBakes(7, [0.5, 0.3, 0.2]), [4, 2, 1]) // 3.5 / 2.1 / 1.4 -> .5 wins
  assert.deepEqual(splitAcrossBakes(1, [0.2, 0.3, 0.5]), [0, 0, 1])
  assert.deepEqual(splitAcrossBakes(0, [0.5, 0.3, 0.2]), [0, 0, 0])
})

test("a single bake takes everything", () => {
  assert.deepEqual(splitAcrossBakes(13, [1]), [13])
})

// ---------------------------------------------------------- buildBakeRows

test("discard fills backwards from the last bake and reconciles exactly", () => {
  // 12 prepared across [7,4,1], 10 discarded -> last bake 1, then 4, then 5 of the 6am bake.
  const rows = buildBakeRows(12, 10, [7 / 12, 4 / 12, 1 / 12])
  assert.deepEqual(rows, [
    { prepared: 7, sold: 2, discarded: 5 },
    { prepared: 4, sold: 0, discarded: 4 },
    { prepared: 1, sold: 0, discarded: 1 },
  ])
  const sold = rows.reduce((s, r) => s + r.sold, 0)
  const discarded = rows.reduce((s, r) => s + r.discarded, 0)
  assert.equal(sold + discarded, 12)
  assert.equal(discarded, 10, "matches the wastage register exactly")
})

test("zero discard: every bake sells through", () => {
  const rows = buildBakeRows(20, 0, [0.5, 0.3, 0.2])
  assert.deepEqual(rows, [
    { prepared: 10, sold: 10, discarded: 0 },
    { prepared: 6, sold: 6, discarded: 0 },
    { prepared: 4, sold: 4, discarded: 0 },
  ])
})

test("discard larger than prepared is clamped so sold never goes negative", () => {
  const rows = buildBakeRows(5, 9, [0.6, 0.4])
  assert.deepEqual(rows, [
    { prepared: 3, sold: 0, discarded: 3 },
    { prepared: 2, sold: 0, discarded: 2 },
  ])
  assert.ok(rows.every((r) => r.sold >= 0))
})

test("nothing prepared yields zero rows all round", () => {
  assert.deepEqual(buildBakeRows(0, 0, [0.5, 0.5]), [
    { prepared: 0, sold: 0, discarded: 0 },
    { prepared: 0, sold: 0, discarded: 0 },
  ])
})

test("sell-through maths: sold / prepared over the day", () => {
  // Bridor-style day: 60 plain croissants prepared, 9 binned at close.
  const rows = buildBakeRows(60, 9, [0.5, 0.3, 0.2])
  const prepared = rows.reduce((s, r) => s + r.prepared, 0)
  const sold = rows.reduce((s, r) => s + r.sold, 0)
  assert.equal(prepared, 60)
  assert.equal(sold, 51)
  assert.equal(Math.round((sold / prepared) * 1000) / 10, 85)
  // The 12pm bake (12 pieces) carries the discard first.
  assert.deepEqual(rows[2], { prepared: 12, sold: 3, discarded: 9 })
})
