import { test } from "node:test"
import assert from "node:assert/strict"
import { resolveDishForTillName, TILL_NAME_ALIASES, NEVER_MATCH_TILL_NAMES, normaliseTillName } from "./enrich"

const dishes = [
  { id: "d1", name: "Chicken Miso Sandwich" },
  { id: "d2", name: "Maca Espresso" },
  { id: "d3", name: "Steak and Frites" },
  { id: "d4", name: "Miso Scramble" },
]
const fuzzyCalls: string[] = []
const fuzzy = (name: string) => {
  fuzzyCalls.push(name)
  if (/miso scramble/i.test(name)) return dishes[3]
  if (/espresso/i.test(name)) return dishes[1] // what Fuse used to do
  return null
}

test("an aliased till name links to its card without touching the fuzzy matcher", () => {
  fuzzyCalls.length = 0
  assert.equal(resolveDishForTillName("Chicken Sandwich", dishes, fuzzy)?.id, "d1")
  assert.equal(resolveDishForTillName("  STEAK & FRITES ", dishes, fuzzy)?.id, "d3")
  assert.deepEqual(fuzzyCalls, [])
})

test("an alias whose card is missing for the venue falls through to fuzzy", () => {
  fuzzyCalls.length = 0
  assert.equal(resolveDishForTillName("Pancakes", dishes, fuzzy), null)
  assert.deepEqual(fuzzyCalls, ["Pancakes"])
})

test("espresso is never costed as the Maca Espresso cocktail", () => {
  fuzzyCalls.length = 0
  assert.equal(resolveDishForTillName("Espresso", dishes, fuzzy), null)
  assert.equal(resolveDishForTillName("Espresso - R", dishes, fuzzy), null)
  assert.deepEqual(fuzzyCalls, [])
  assert.equal(resolveDishForTillName("Maca Espresso", dishes, fuzzy)?.id, "d2")
})

test("unaliased names still go through fuzzy matching", () => {
  assert.equal(resolveDishForTillName("Miso Scramble", dishes, fuzzy)?.id, "d4")
})

test("alias keys are normalised and the deny list is lower case", () => {
  for (const k of Object.keys(TILL_NAME_ALIASES)) assert.equal(k, normaliseTillName(k))
  for (const k of NEVER_MATCH_TILL_NAMES) assert.equal(k, normaliseTillName(k))
})
