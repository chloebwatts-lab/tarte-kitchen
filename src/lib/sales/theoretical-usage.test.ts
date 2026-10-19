import { test } from "node:test"
import assert from "node:assert/strict"
import Decimal from "decimal.js"
import {
  expandDishUsage,
  ingredientBaseQuantity,
  type UsagePreparation,
  type UsageLine,
} from "./theoretical-usage"
import { preparationBatchFraction, preparationLineCost } from "@/lib/units"

const CREAM = { id: "cream", baseUnitType: "VOLUME", gramsPerUnit: null }
const EGGS = { id: "eggs", baseUnitType: "COUNT", gramsPerUnit: null }
const AVO = { id: "avo", baseUnitType: "COUNT", gramsPerUnit: 200 }
const BUTTER = { id: "butter", baseUnitType: "WEIGHT", gramsPerUnit: null }

// Miso Scramble Mix as on prod 19 Oct 2026: 975 ml cream per batch,
// yield 37 serve, batch weight 11,250 g, used at 300 g per Miso Scramble.
const misoMix: UsagePreparation = {
  id: "miso",
  yieldQuantity: 37,
  yieldUnit: "serve",
  yieldWeightGrams: 11250,
  items: [
    { ingredientId: "cream", ingredient: CREAM, quantity: 975, unit: "ml", lineCost: 7.37 },
    { ingredientId: "eggs", ingredient: EGGS, quantity: 10, unit: "dozen", lineCost: 60 },
  ],
}
// Scrambled egg mix: 975 ml cream, 73 serves, 9,500 g
const scrambleMix: UsagePreparation = {
  id: "scramble",
  yieldQuantity: 73,
  yieldUnit: "serves",
  yieldWeightGrams: 9500,
  items: [{ ingredientId: "cream", ingredient: CREAM, quantity: 975, unit: "ml", lineCost: 7.37 }],
}
// Guzzy Burrito prep contains 2 kg of scramble mix and yields 10 serve, 4,000 g
const burritoFilling: UsagePreparation = {
  id: "burrito",
  yieldQuantity: 10,
  yieldUnit: "serve",
  yieldWeightGrams: 4000,
  items: [
    { subPreparationId: "scramble", quantity: 2, unit: "kg", lineCost: 15.13 },
    { ingredientId: "butter", ingredient: BUTTER, quantity: 0.1, unit: "kg", lineCost: 1.2 },
  ],
}
const preps = new Map<string, UsagePreparation>([
  ["miso", misoMix],
  ["scramble", scrambleMix],
  ["burrito", burritoFilling],
])

test("a dish takes its share of the prep batch, not the whole batch", () => {
  const dish: UsageLine[] = [{ preparationId: "miso", quantity: 300, unit: "g", lineCost: 2 }]
  const acc = expandDishUsage(dish, 1, preps, new Map())
  // 300/11250 x 975 ml = 26 ml of cream per Miso Scramble
  assert.equal(acc.get("cream")!.qty.toFixed(2), "26.00")
  assert.equal(acc.get("cream")!.unit, "ml")
  // cost scales by the same fraction
  assert.equal(acc.get("cream")!.cost.toFixed(4), new Decimal(7.37).mul(300).div(11250).toFixed(4))
  // eggs: 10 dozen = 120 ea per batch, x 300/11250
  assert.equal(acc.get("eggs")!.qty.toFixed(2), "3.20")
  assert.equal(acc.get("eggs")!.unit, "ea")
})

test("multiplies by the number sold and accumulates across sales", () => {
  const dish: UsageLine[] = [{ preparationId: "miso", quantity: 300, unit: "g", lineCost: 2 }]
  const acc = new Map()
  expandDishUsage(dish, 40, preps, acc)
  expandDishUsage(dish, 10, preps, acc)
  assert.equal(acc.get("cream")!.qty.toFixed(0), "1300")
})

test("serve against serve yield divides by yieldQuantity", () => {
  const dish: UsageLine[] = [{ preparationId: "scramble", quantity: 1, unit: "serve", lineCost: 1 }]
  const acc = expandDishUsage(dish, 73, preps, new Map())
  // 73 serves sold = exactly one batch
  assert.equal(acc.get("cream")!.qty.toFixed(0), "975")
})

test("sub-preparations are followed and scaled by each level's fraction", () => {
  const dish: UsageLine[] = [{ preparationId: "burrito", quantity: 1, unit: "serve", lineCost: 3 }]
  const acc = expandDishUsage(dish, 1, preps, new Map())
  // 1/10 of burrito batch -> 2000/9500 of scramble batch -> 975 ml cream
  const want = new Decimal(975).mul(2000).div(9500).div(10)
  assert.equal(acc.get("cream")!.qty.toFixed(3), want.toFixed(3))
  // 100 g butter per burrito batch, 1/10 of it, in grams
  assert.equal(acc.get("butter")!.qty.toFixed(0), "10")
  assert.equal(acc.get("butter")!.unit, "g")
})

test("direct ingredient lines convert to base units", () => {
  const dish: UsageLine[] = [
    { ingredientId: "butter", ingredient: BUTTER, quantity: 0.25, unit: "kg", lineCost: 3 },
    { ingredientId: "avo", ingredient: AVO, quantity: 100, unit: "g", lineCost: 1 },
    { ingredientId: "cream", ingredient: CREAM, quantity: 50, unit: "g", lineCost: 0.4 },
  ]
  const acc = expandDishUsage(dish, 2, preps, new Map())
  assert.equal(acc.get("butter")!.qty.toFixed(0), "500")
  // 100 g of a 200 g avocado = half an avo, x2 sold
  assert.equal(acc.get("avo")!.qty.toFixed(1), "1.0")
  assert.equal(acc.get("avo")!.unit, "ea")
  // cream written in g on a VOLUME ingredient: 1:1 into ml
  assert.equal(acc.get("cream")!.qty.toFixed(0), "100")
  assert.equal(acc.get("cream")!.unit, "ml")
})

test("unknown recipe units (bunch, punnet) count 1:1 instead of throwing", () => {
  assert.equal(ingredientBaseQuantity(2, "bunch", EGGS).toNumber(), 2)
  assert.equal(ingredientBaseQuantity(1, "punnet", EGGS).toNumber(), 1)
})

test("zero yield weight, missing prep, cycles and runaway depth add nothing", () => {
  const cyc: UsagePreparation = {
    id: "cyc",
    yieldQuantity: 1000,
    yieldUnit: "g",
    yieldWeightGrams: 1000,
    items: [
      { subPreparationId: "cyc", quantity: 500, unit: "g", lineCost: 0 },
      { ingredientId: "butter", ingredient: BUTTER, quantity: 100, unit: "g", lineCost: 1 },
    ],
  }
  const noWeight: UsagePreparation = {
    id: "nw",
    yieldQuantity: 20,
    yieldUnit: "serve",
    yieldWeightGrams: 0,
    items: [{ ingredientId: "cream", ingredient: CREAM, quantity: 500, unit: "ml", lineCost: 4 }],
  }
  const p = new Map<string, UsagePreparation>([["cyc", cyc], ["nw", noWeight]])
  const dish: UsageLine[] = [
    { preparationId: "cyc", quantity: 100, unit: "g", lineCost: 1 },
    { preparationId: "nw", quantity: 50, unit: "g", lineCost: 1 },
    { preparationId: "missing", quantity: 1, unit: "serve", lineCost: 1 },
  ]
  const acc = expandDishUsage(dish, 1, p, new Map())
  // cycle visited once only: 100/1000 x 100 g butter
  assert.equal(acc.get("butter")!.qty.toFixed(0), "10")
  assert.equal(acc.has("cream"), false)
  // zero sold adds nothing
  assert.equal(expandDishUsage(dish, 0, p, new Map()).size, 0)
})

test("preparationLineCost still equals fraction x batch cost", () => {
  const f = preparationBatchFraction(300, "g", 37, "serve", 11250)
  assert.equal(f.toFixed(6), new Decimal(300).div(11250).toFixed(6))
  assert.equal(
    preparationLineCost(300, "g", 100, 37, "serve", 11250).toFixed(4),
    f.mul(100).toFixed(4)
  )
  assert.equal(preparationBatchFraction(2, "serve", 76, "serves", 3800).toFixed(6), new Decimal(2).div(76).toFixed(6))
  assert.equal(preparationBatchFraction(1, "dozen", 70, "ea", 0).toFixed(4), new Decimal(12).div(70).toFixed(4))
  assert.equal(preparationBatchFraction(100, "g", 10, "serve", 0).toNumber(), 0)
})
