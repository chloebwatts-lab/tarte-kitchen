// Money-side cases for the recipe costing engine in units.ts, complementing
// units.test.ts (unit table + conversions). Focus here: exact Decimal cents on
// real Tarte purchases, GST stripping, and boundaries that would misstate a
// dish cost if they drifted.
import { test } from "node:test"
import assert from "node:assert/strict"
import Decimal from "decimal.js"
import {
  toBaseUnits,
  costPerBaseUnit,
  ingredientLineCost,
  preparationLineCost,
  foodCostPercentage,
  exGst,
  costTrafficLight,
  type IngredientCostInfo,
} from "./units"

const anchorButter5kg: IngredientCostInfo = {
  // Bidfood BUTTER SALTED ANCHOR 5kg BLK at $83.48
  purchasePrice: new Decimal("83.48"),
  baseUnitsPerPurchase: new Decimal(5000),
  wastePercentage: new Decimal(0),
  baseUnitType: "WEIGHT",
}
const eggs15dz: IngredientCostInfo = {
  // 15 dozen carton = 180 ea at $72
  purchasePrice: new Decimal(72),
  baseUnitsPerPurchase: new Decimal(180),
  wastePercentage: new Decimal(0),
  baseUnitType: "COUNT",
}
const milk2L: IngredientCostInfo = {
  purchasePrice: new Decimal("3.40"),
  baseUnitsPerPurchase: new Decimal(2000),
  wastePercentage: new Decimal(0),
  baseUnitType: "VOLUME",
}
const striploinKg: IngredientCostInfo = {
  purchasePrice: new Decimal(33),
  baseUnitsPerPurchase: new Decimal(1000),
  wastePercentage: new Decimal(38),
  baseUnitType: "WEIGHT",
}

test("Decimal keeps recipe grams exact where binary floats would not", () => {
  // 0.1 kg + 0.2 kg is exactly 300 g, not 300.00000000000006
  assert.equal(toBaseUnits(new Decimal("0.1"), "kg").plus(toBaseUnits(new Decimal("0.2"), "kg")).toString(), "300")
  assert.equal(0.1 + 0.2 === 0.3, false)
})

test("Anchor butter 5 kg block: cost per gram is exactly 0.016696 and 100 g is $1.6696", () => {
  assert.equal(costPerBaseUnit(anchorButter5kg).toString(), "0.016696")
  assert.equal(ingredientLineCost(100, "g", anchorButter5kg).toString(), "1.6696")
  // the whole block back out is the purchase price to the cent
  assert.equal(ingredientLineCost(5, "kg", anchorButter5kg).toString(), "83.48")
})

test("eggs by the each and by the dozen out of a 15 dozen carton", () => {
  // $72 / 180 = $0.40 each
  assert.equal(ingredientLineCost(2, "ea", eggs15dz).toString(), "0.8")
  assert.equal(ingredientLineCost(1, "dozen", eggs15dz).toString(), "4.8")
  assert.equal(ingredientLineCost(15, "dozen", eggs15dz).toString(), "72")
})

test("milk in ml and in litres cost the same", () => {
  assert.equal(ingredientLineCost(200, "ml", milk2L).toString(), "0.34")
  assert.equal(ingredientLineCost(new Decimal("0.2"), "l", milk2L).toString(), "0.34")
})

test("a free ingredient costs nothing, a trimmed one costs more per usable gram", () => {
  assert.equal(costPerBaseUnit({ ...anchorButter5kg, purchasePrice: new Decimal(0) }).toNumber(), 0)
  // 200 g striploin at 38% trim: 200 x 33 / 620 = 10.645161...
  assert.equal(ingredientLineCost(200, "g", striploinKg).toDecimalPlaces(4).toString(), "10.6452")
  assert.ok(costPerBaseUnit(striploinKg).gt(costPerBaseUnit({ ...striploinKg, wastePercentage: new Decimal(0) })))
})

test("preparation cost carries a 20-digit tail before callers round to 4 dp", () => {
  // 1 ea from a 70 ea batch at $35: divide-then-multiply gives
  // 0.49999999999999999999; dishes.ts stores toDecimalPlaces(4), which is
  // exactly $0.50. Pinned so a change in operation order is visible.
  const raw = preparationLineCost(1, "ea", 35, 70, "ea", 5000)
  assert.equal(raw.toDecimalPlaces(4).toString(), "0.5")
  assert.equal(raw.toDecimalPlaces(2).toString(), "0.5")
  // two serves of a 76-serve crumpet batch at $45.60 is $1.20
  assert.equal(preparationLineCost(2, "serve", new Decimal("45.60"), 76, "serve", 3800).toDecimalPlaces(4).toString(), "1.2")
})

test("a serve against a weight-only yield is read as one gram (needs a serve yield to mean anything)", () => {
  // yieldUnit "g" is not a count unit, so "1 serve" of a 3800 g / $3800 batch
  // is priced as 1 g. Documented, since a prep saved with a gram yield but
  // costed per serve would silently understate the dish.
  const c = preparationLineCost(1, "serve", 3800, 3800, "g", 3800)
  assert.equal(c.toDecimalPlaces(4).toString(), "1")
})

test("food cost % on the $26.90 dish strips GST first", () => {
  // $6.72 cost: 26.90 / 1.1 = 24.4545 ex, 6.72 / 24.4545 = 27.48%
  assert.equal(foodCostPercentage(new Decimal("6.72"), new Decimal("26.90")).toDecimalPlaces(2).toString(), "27.48")
  // $5 on $22 inc is exactly 25%
  assert.equal(foodCostPercentage(5, 22).toString(), "25")
  // sold below cost is allowed to read over 100%
  assert.ok(foodCostPercentage(30, 26.9).gt(100))
})

test("exGst divides by 1.1 exactly and round-trips", () => {
  assert.equal(exGst(11).toString(), "10")
  assert.equal(exGst(new Decimal("1.10")).toString(), "1")
  assert.equal(exGst(0).toNumber(), 0)
  const threeTenths = new Decimal("0.1").plus("0.2")
  assert.equal(exGst(threeTenths).mul("1.1").toString(), "0.3")
})

test("traffic light: negative (data error) reads green rather than crashing, string input accepted", () => {
  assert.equal(costTrafficLight(-5), "green")
  assert.equal(costTrafficLight(new Decimal("35.01")), "red")
  assert.equal(costTrafficLight(new Decimal("30")), "amber")
})
