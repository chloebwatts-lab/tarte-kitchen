import { test } from "node:test"
import assert from "node:assert/strict"
import Decimal from "decimal.js"
import {
  getUnitType,
  toBaseUnits,
  fromBaseUnits,
  getRecipeUnits,
  getPreparationUnits,
  PURCHASE_UNITS,
  RECIPE_UNITS,
  costPerBaseUnit,
  ingredientLineCost,
  preparationLineCost,
  foodCostPercentage,
  exGst,
  costTrafficLight,
  type IngredientCostInfo,
} from "./units"

const D = (n: number | string) => new Decimal(n)
const near = (got: Decimal, want: number, dp = 4) =>
  assert.equal(got.toDecimalPlaces(dp).toNumber(), want)

// ---------------------------------------------------------------- unit table

test("getUnitType: case-insensitive, legacy plural serves, packaging units unknown", () => {
  assert.equal(getUnitType("KG"), "WEIGHT")
  assert.equal(getUnitType("oz"), "WEIGHT")
  assert.equal(getUnitType("Ml"), "VOLUME")
  assert.equal(getUnitType("cl"), "VOLUME")
  assert.equal(getUnitType("dozen"), "COUNT")
  assert.equal(getUnitType("serve"), "COUNT")
  assert.equal(getUnitType("serves"), "COUNT")
  assert.equal(getUnitType("carton"), null)
  assert.equal(getUnitType(""), null)
})

test("toBaseUnits / fromBaseUnits round trip", () => {
  assert.equal(toBaseUnits(2.5, "kg").toNumber(), 2500)
  assert.equal(toBaseUnits(D("0.75"), "L").toNumber(), 750)
  assert.equal(toBaseUnits(1, "dozen").toNumber(), 12)
  assert.equal(toBaseUnits(3, "serves").toNumber(), 3)
  near(toBaseUnits(1, "lb"), 453.592, 3)
  assert.equal(fromBaseUnits(2500, "kg").toNumber(), 2.5)
  assert.equal(fromBaseUnits(36, "dozen").toNumber(), 3)
  assert.equal(fromBaseUnits(toBaseUnits(7, "oz"), "oz").toNumber(), 7)
})

test("toBaseUnits / fromBaseUnits throw on unknown units", () => {
  assert.throws(() => toBaseUnits(1, "carton"), /Unknown unit: carton/)
  assert.throws(() => fromBaseUnits(1, "bunch"), /Unknown unit: bunch/)
  assert.throws(() => toBaseUnits(1, ""), /Unknown unit/)
})

test("unit lists: recipe units never include packaging, preparations offer serve", () => {
  assert.deepEqual(getRecipeUnits("WEIGHT"), ["g", "kg"])
  assert.deepEqual(getRecipeUnits("VOLUME"), ["ml", "l"])
  assert.deepEqual(getRecipeUnits("COUNT"), ["ea", "dozen"])
  assert.deepEqual(getRecipeUnits("???"), ["g", "kg", "ml", "l", "ea"])
  assert.ok(getPreparationUnits().includes("serve"))
  for (const u of RECIPE_UNITS) assert.notEqual(getUnitType(u), null, u)
  for (const u of ["carton", "box", "bag", "packet", "case", "tub", "bottle", "bunch"]) {
    assert.ok(PURCHASE_UNITS.includes(u), u)
    assert.ok(!RECIPE_UNITS.includes(u), u)
  }
})

// ---------------------------------------------------------------- costs

const striploin: IngredientCostInfo = {
  purchasePrice: D(33),
  baseUnitsPerPurchase: D(1000),
  wastePercentage: D(38),
  baseUnitType: "WEIGHT",
}
const salmon: IngredientCostInfo = {
  purchasePrice: D(42),
  baseUnitsPerPurchase: D(1000),
  wastePercentage: D(0),
  baseUnitType: "WEIGHT",
}
const cosLettuce: IngredientCostInfo = {
  purchasePrice: D("2.10"),
  baseUnitsPerPurchase: D(1),
  wastePercentage: D(0),
  baseUnitType: "COUNT",
  gramsPerUnit: D(300),
}
const bbqSauce: IngredientCostInfo = {
  purchasePrice: D("4.80"),
  baseUnitsPerPurchase: D(1),
  wastePercentage: D(0),
  baseUnitType: "COUNT",
  gramsPerUnit: D(400), // 400ml bottle
}

test("costPerBaseUnit: waste inflates the usable cost", () => {
  near(costPerBaseUnit(striploin), 0.0532)
  near(costPerBaseUnit(salmon), 0.042)
})

test("costPerBaseUnit: zero base units or 100% waste is 0, not a division error", () => {
  assert.equal(costPerBaseUnit({ ...salmon, baseUnitsPerPurchase: D(0) }).toNumber(), 0)
  assert.equal(costPerBaseUnit({ ...salmon, wastePercentage: D(100) }).toNumber(), 0)
})

test("ingredientLineCost: same-family weight and cross-unit count-by-weight", () => {
  near(ingredientLineCost(60, "g", salmon), 2.52)
  near(ingredientLineCost(D("0.06"), "kg", salmon), 2.52)
  near(ingredientLineCost(20, "g", cosLettuce), 0.14)
  near(ingredientLineCost(30, "ml", bbqSauce), 0.36)
  near(ingredientLineCost(1, "ea", cosLettuce), 2.1)
  near(ingredientLineCost(1, "dozen", cosLettuce), 25.2)
})

test("ingredientLineCost: waste applies to cross-unit too", () => {
  const trimmedLettuce = { ...cosLettuce, wastePercentage: D(50) }
  near(ingredientLineCost(20, "g", trimmedLettuce), 0.28)
})

test("ingredientLineCost: zero quantity is zero cost", () => {
  assert.equal(ingredientLineCost(0, "g", salmon).toNumber(), 0)
})

test("ingredientLineCost: count ingredient used by weight WITHOUT gramsPerUnit falls to the count path", () => {
  // No gramsPerUnit means 20 "g" is priced as 20 each. The recipe builder only
  // offers ea/dozen for COUNT ingredients, so this path should be unreachable
  // from the UI; pinned here so a regression in that guard is visible.
  const noGrams = { ...cosLettuce, gramsPerUnit: null }
  near(ingredientLineCost(20, "g", noGrams), 42)
  near(ingredientLineCost(20, "g", { ...cosLettuce, gramsPerUnit: D(0) }), 42)
})

test("preparationLineCost: weight fraction of the batch", () => {
  // crumpet batter: 3800 g batch costing $19.00, 76 serves
  near(preparationLineCost(100, "g", 19, 76, "serve", 3800), 0.5)
  near(preparationLineCost(D("0.1"), "kg", 19, 76, "serve", 3800), 0.5)
  near(preparationLineCost(500, "ml", 12, 1, "l", 2000), 3)
})

test("preparationLineCost: count against count, incl. dozen and legacy serves", () => {
  near(preparationLineCost(2, "serve", 19, 76, "serve", 3800), 0.5)
  near(preparationLineCost(2, "serves", 19, 76, "serves", 3800), 0.5)
  near(preparationLineCost(1, "ea", 35, 70, "ea", 5000), 0.5)
  near(preparationLineCost(1, "dozen", 35, 70, "ea", 5000), 6)
})

test("preparationLineCost: zero yields return 0 rather than throwing", () => {
  assert.equal(preparationLineCost(100, "g", 19, 76, "serve", 0).toNumber(), 0)
  assert.equal(preparationLineCost(2, "serve", 19, 0, "serve", 3800).toNumber(), 0)
})

test("preparationLineCost: count unit against a weight yield uses the weight path", () => {
  // "1 ea" from a batch whose yield is recorded in kg: ea -> 1 base unit over yieldWeightGrams
  near(preparationLineCost(1, "ea", 10, 2, "kg", 2000), 0.005)
})

// ---------------------------------------------------------------- GST and traffic light

test("exGst and foodCostPercentage use the Australian 10% GST", () => {
  near(exGst(D("26.90")), 24.4545)
  near(foodCostPercentage(D("5.34"), D("26.90")), 21.8364) // charred leek salad
  assert.equal(foodCostPercentage(5, 0).toNumber(), 0)
  assert.equal(foodCostPercentage(0, 26.9).toNumber(), 0)
})

test("costTrafficLight: 30 and 35 boundaries", () => {
  assert.equal(costTrafficLight(29.99), "green")
  assert.equal(costTrafficLight(30), "amber")
  assert.equal(costTrafficLight(35), "amber")
  assert.equal(costTrafficLight(35.01), "red")
  assert.equal(costTrafficLight(D(0)), "green")
  assert.equal(costTrafficLight(D(100)), "red")
})
