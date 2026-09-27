import { test } from "node:test"
import assert from "node:assert/strict"
import { buildCanonicalizer } from "./canonical"

const dishes = [{ name: "Croissant - Almond" }, { name: "Cinnamon Cruller" }]
const preps = [
  { name: "Almond Croissant - Each" },
  { name: "Almond Croissant" },
  { name: "Mini Almond Croissant" },
  { name: "Sourdough Loaf - Each" },
  { name: "Miso Mayo Base" },
]

test("dish, per-piece prep and batch prep all collapse onto the dish name", () => {
  const canon = buildCanonicalizer(dishes, preps)
  assert.equal(canon("Croissant - Almond"), "Croissant - Almond")
  assert.equal(canon("Almond Croissant - Each"), "Croissant - Almond")
  assert.equal(canon("Almond Croissant"), "Croissant - Almond")
  assert.equal(canon("ALMOND CROISSANT each"), "Croissant - Almond")
})

test("mini variants are kept apart from the full-size item", () => {
  const canon = buildCanonicalizer(dishes, preps)
  assert.equal(canon("Mini Almond Croissant"), "Mini Almond Croissant")
  assert.equal(canon("Almond Croissant Mini - Each"), "Mini Almond Croissant")
  assert.notEqual(canon("Mini Almond Croissant"), canon("Almond Croissant"))
})

test("without a dish, the shortest bare prep name wins", () => {
  const canon = buildCanonicalizer([], [{ name: "Sourdough Loaf - Each" }, { name: "Sourdough Loaf" }])
  assert.equal(canon("Sourdough Loaf - Each"), "Sourdough Loaf")
  assert.equal(canon("Loaf Sourdough"), "Sourdough Loaf")
})

test("unknown items just lose their per-piece suffix", () => {
  const canon = buildCanonicalizer(dishes, preps)
  assert.equal(canon("Lamington - Each"), "Lamington")
  assert.equal(canon("Lamington each"), "Lamington")
  assert.equal(canon("Lamington"), "Lamington")
  assert.equal(canon(""), "")
})

test("word order and dash/underscore variants map to the same row", () => {
  const canon = buildCanonicalizer(dishes, preps)
  assert.equal(canon("Cruller Cinnamon"), "Cinnamon Cruller")
  assert.equal(canon("cinnamon_cruller"), "Cinnamon Cruller")
  assert.equal(canon("Cinnamon – Cruller"), "Cinnamon Cruller")
})

test("a trailing 'each' suffix is stripped", () => {
  const canon = buildCanonicalizer([], [])
  assert.equal(canon("Peach Each"), "Peach")
  assert.equal(canon("Spinach"), "Spinach")
})

test(
  "names ending in the letters 'each' keep their tail (Peach stays Peach)",
  () => {
    const canon = buildCanonicalizer([], [])
    assert.equal(canon("Peach"), "Peach")
    assert.equal(canon("Each Peach"), "Each Peach")
  }
)
