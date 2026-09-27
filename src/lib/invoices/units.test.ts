import { test } from "node:test"
import assert from "node:assert/strict"
import {
  parsePackSize,
  normaliseUnit,
  unitsAreCompatible,
  inferConversionFromPack,
  metricConversionFactor,
  effectiveUnitPrice,
  compareUnits,
  evaluatePriceChange,
  newPurchasePriceFromComparison,
  type IngredientUnitInfo,
} from "./units"

// Realistic stored ingredients (Ingredient.purchaseUnit / purchaseQuantity / purchasePrice)
const butterG: IngredientUnitInfo = { purchaseUnit: "g", purchaseQuantity: 500, purchasePrice: 6.69 } // Anchor 500g pat
const sugarKg: IngredientUnitInfo = { purchaseUnit: "kg", purchaseQuantity: 1, purchasePrice: 2.7 }
const capsicumKg: IngredientUnitInfo = { purchaseUnit: "kg", purchaseQuantity: 1, purchasePrice: 5.88 }
const kaleCarton: IngredientUnitInfo = { purchaseUnit: "carton", purchaseQuantity: 1, purchasePrice: 45 }
const milkMl: IngredientUnitInfo = { purchaseUnit: "ml", purchaseQuantity: 1000, purchasePrice: 2.2 }
const croissantPiece: IngredientUnitInfo = { purchaseUnit: "piece", purchaseQuantity: 60, purchasePrice: 65.92 } // Bridor carton of 60
const corianderEa: IngredientUnitInfo = { purchaseUnit: "ea", purchaseQuantity: 1, purchasePrice: 3.5 }

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp

// ---------------------------------------------------------------- parsePackSize

test("parsePackSize: plain metric sizes across suppliers", () => {
  assert.deepEqual(parsePackSize("BUTTER SALTED ANCHOR 5kg"), { qty: 5, unit: "kg" }) // Bidfood
  assert.deepEqual(parsePackSize("FLOUR BAKERS 12.5KG BAG"), { qty: 12.5, unit: "kg" }) // Fermex
  assert.deepEqual(parsePackSize("BACON MIDDLE RASHERS 2.5kg"), { qty: 2.5, unit: "kg" }) // Son of a Bunn
  assert.deepEqual(parsePackSize("BEEF STRIPLOIN MSA 5kg avg"), { qty: 5, unit: "kg" })
  assert.deepEqual(parsePackSize("GARAM MASALA CANISTER TRUMPS 400gr"), { qty: 0.4, unit: "kg" })
  assert.deepEqual(parsePackSize("Vanilla 100gm"), { qty: 0.1, unit: "kg" })
  assert.deepEqual(parsePackSize("500G"), { qty: 0.5, unit: "kg" })
  assert.deepEqual(parsePackSize("Bag 5 kgs"), { qty: 5, unit: "kg" })
})

test("parsePackSize: volume synonyms all normalise to litres", () => {
  assert.deepEqual(parsePackSize("Cream 1l"), { qty: 1, unit: "l" })
  assert.deepEqual(parsePackSize("1.5L"), { qty: 1.5, unit: "l" })
  assert.deepEqual(parsePackSize("Milk 10LT"), { qty: 10, unit: "l" })
  assert.deepEqual(parsePackSize("2 Ltr"), { qty: 2, unit: "l" })
  assert.deepEqual(parsePackSize("Water 24x600ML"), { qty: 14.4, unit: "l" })
})

test("parsePackSize: multipliers (forward, reversed, worded, triple, multipack)", () => {
  assert.deepEqual(parsePackSize("Coconut Milk 12x400ml CTN"), { qty: 4.8, unit: "l" })
  assert.deepEqual(parsePackSize("Olive Oil 4 x 4L"), { qty: 16, unit: "l" })
  assert.deepEqual(parsePackSize("ORANGE JUICE 2 X 5LT"), { qty: 10, unit: "l" })
  assert.deepEqual(parsePackSize("10 x 1 kg"), { qty: 10, unit: "kg" })
  assert.deepEqual(parsePackSize("400ml x 12"), { qty: 4.8, unit: "l" })
  assert.deepEqual(parsePackSize("Coke 24 x 375ml"), { qty: 9, unit: "l" })
  assert.deepEqual(parsePackSize("ANCHOVIES 12 X 720G TIN"), { qty: 8.64, unit: "kg" })
  assert.deepEqual(parsePackSize("YOGHURT GREEK 1kg tub x 6"), { qty: 6, unit: "kg" })
  assert.deepEqual(parsePackSize("SODA WATER 4 X 6 X 250ML"), { qty: 6, unit: "l" })
  assert.deepEqual(parsePackSize("Pack 12 x 2 x 500g"), { qty: 12, unit: "kg" })
  assert.deepEqual(parsePackSize("REAL COCONUT CREAM 12PK : 500ML"), { qty: 6, unit: "l" })
  assert.deepEqual(parsePackSize("6pk 375ml"), { qty: 2.25, unit: "l" })
})

test("parsePackSize: counts and dozens normalise to ea", () => {
  assert.deepEqual(parsePackSize("Eggs Free Range 15dz"), { qty: 180, unit: "ea" })
  assert.deepEqual(parsePackSize("Eggs 15 Dozen"), { qty: 180, unit: "ea" })
  assert.deepEqual(parsePackSize("Eggs 1 dozen"), { qty: 12, unit: "ea" })
  assert.deepEqual(parsePackSize("Item 100 pieces"), { qty: 100, unit: "ea" })
})

test("parsePackSize: bracketed piece grades are stripped, not parsed as the pack", () => {
  assert.deepEqual(parsePackSize("Slipper Bug Meat Raw [10-50g] 1kg"), { qty: 1, unit: "kg" }) // GFW
  assert.deepEqual(parsePackSize("Salmon Fillet [200-250g] 5kg"), { qty: 5, unit: "kg" })
  // Only a grade, no pack size left after stripping
  assert.equal(parsePackSize("SALMON ATLANTIC FILLET SKIN ON [1.8-2.2kg]"), null)
})

test("parsePackSize: nasty inputs", () => {
  assert.equal(parsePackSize(""), null)
  assert.equal(parsePackSize("   "), null)
  assert.equal(parsePackSize("CAPSICUM RED KG"), null) // per-kg line, no number
  assert.equal(parsePackSize("3 x"), null)
  assert.equal(parsePackSize("5 x kg"), null)
  assert.equal(parsePackSize("12PK"), null)
  assert.equal(parsePackSize('TORTILLAS FLOUR 10" CATERERS C 12\'s'), null)
  assert.deepEqual(parsePackSize("  MILK FULL CREAM 2L  "), { qty: 2, unit: "l" }) // trailing whitespace
  assert.deepEqual(parsePackSize("Kale 5kg\n"), { qty: 5, unit: "kg" })
  assert.deepEqual(parsePackSize("Crème Fraîche 1kg"), { qty: 1, unit: "kg" }) // unicode
  assert.deepEqual(parsePackSize("Zucchini 5KG (Green)"), { qty: 5, unit: "kg" })
  assert.deepEqual(parsePackSize("12345 Butter 5kg"), { qty: 5, unit: "kg" }) // leading product code
  assert.deepEqual(parsePackSize("Tomatoes 10 kg 2nd grade"), { qty: 10, unit: "kg" })
})

test("parsePackSize: piece weight on a carton line parses as a tiny pack (mapping must override)", () => {
  // Eustralis bills the Bridor carton as "ea"; the 70g is the croissant, not the pack.
  // Documented limitation, compareUnits step 0 (unit-scoped mapping) is what saves it.
  assert.deepEqual(parsePackSize("Bridor Croissant Large 70g"), { qty: 0.07, unit: "kg" })
})

test("parsePackSize: thousands separator is not read as a zero pack", () => {
  // "1,000g" parses as 000g; a zero quantity must mean "no pack size", never Infinity downstream.
  assert.equal(parsePackSize("SUGAR 1,000g bag"), null)
  assert.equal(parsePackSize("SUGAR 0kg bag"), null)
})

// ---------------------------------------------------------------- normaliseUnit / compat

test("normaliseUnit: synonyms, case, trailing dot, whitespace", () => {
  assert.equal(normaliseUnit("KG."), "kg")
  assert.equal(normaliseUnit(" Ctn "), "carton")
  assert.equal(normaliseUnit("PKT"), "pack")
  assert.equal(normaliseUnit("Kilos"), "kg")
  assert.equal(normaliseUnit("BTL"), "bottle")
  assert.equal(normaliseUnit("bch"), "bunch")
  assert.equal(normaliseUnit("pun"), "punnet")
  assert.equal(normaliseUnit("Each"), "ea")
  assert.equal(normaliseUnit("blk"), "blk") // unknown passes through lowercased
  assert.equal(normaliseUnit(null), "")
  assert.equal(normaliseUnit(undefined), "")
  assert.equal(normaliseUnit(""), "")
})

test("unitsAreCompatible: same group only, empty never compatible", () => {
  assert.equal(unitsAreCompatible("KG", "kilos"), true)
  assert.equal(unitsAreCompatible("CTN", "carton"), true)
  assert.equal(unitsAreCompatible("kg", "g"), false) // metric siblings are NOT same-group
  assert.equal(unitsAreCompatible("ea", "bunch"), false)
  assert.equal(unitsAreCompatible(null, "kg"), false)
  assert.equal(unitsAreCompatible("", ""), false)
})

// ---------------------------------------------------------------- conversions

test("inferConversionFromPack: pack-priced line to stored unit is 1/contents", () => {
  assert.equal(inferConversionFromPack({ qty: 15, unit: "kg" }, "kg", 1), 1 / 15)
  assert.equal(inferConversionFromPack({ qty: 5, unit: "kg" }, "g", 500), 1 / 5000)
  assert.equal(inferConversionFromPack({ qty: 6, unit: "l" }, "l", 1), 1 / 6)
  assert.equal(inferConversionFromPack({ qty: 6, unit: "l" }, "ML", 1000), 1 / 6000)
  assert.equal(inferConversionFromPack({ qty: 60, unit: "ea" }, "piece", 60), 1 / 60)
})

test("inferConversionFromPack: pack-unit or cross-family stored units are not guessed", () => {
  assert.equal(inferConversionFromPack({ qty: 5, unit: "kg" }, "carton", 1), null)
  assert.equal(inferConversionFromPack({ qty: 5, unit: "kg" }, "l", 1), null)
  assert.equal(inferConversionFromPack({ qty: 12, unit: "ea" }, "kg", 1), null)
})

test("metricConversionFactor: kg<->g and l<->ml, nothing else", () => {
  assert.equal(metricConversionFactor("kg", "g"), 0.001)
  assert.equal(metricConversionFactor("G", "KG"), 1000)
  assert.equal(metricConversionFactor("l", "ml"), 0.001)
  assert.equal(metricConversionFactor("ml", "litre"), 1000)
  assert.equal(metricConversionFactor("kg", "l"), null)
  assert.equal(metricConversionFactor("ea", "ea"), null)
  assert.equal(metricConversionFactor(null, "kg"), null)
})

// ---------------------------------------------------------------- effectiveUnitPrice

test("effectiveUnitPrice: 5% disagreement boundary", () => {
  assert.equal(effectiveUnitPrice(105, 1, 100), 105) // exactly 5% off, trusted
  assert.equal(effectiveUnitPrice(105.01, 1, 100), 100) // over 5%, lineTotal/qty wins
  assert.equal(effectiveUnitPrice(0.54, 1, 0.5), 0.54) // small totals use 5c floor
  assert.equal(effectiveUnitPrice(0.56, 1, 0.5), 0.5)
})

test("effectiveUnitPrice: Jensens discount and lineTotal-as-unitPrice slip", () => {
  assert.equal(effectiveUnitPrice(5.95, 1, 5.35), 5.35)
  assert.equal(round(effectiveUnitPrice(41.94, 6, 41.94) ?? 0, 2), 6.99)
})

test("effectiveUnitPrice: nulls, zeros, credits and non-finite fall back to raw", () => {
  assert.equal(effectiveUnitPrice(null, 1, 10), null)
  assert.equal(effectiveUnitPrice(5, null, 10), 5)
  assert.equal(effectiveUnitPrice(5, 1, null), 5)
  assert.equal(effectiveUnitPrice(0, 1, 100), 0)
  assert.equal(effectiveUnitPrice(5, 0, 100), 5)
  assert.equal(effectiveUnitPrice(11.2, 12, -134.4), 11.2) // credit line
  assert.equal(effectiveUnitPrice(5, -2, -10), 5)
  assert.ok(Number.isNaN(effectiveUnitPrice(NaN, 1, 100)))
})

// ---------------------------------------------------------------- compareUnits

test("compareUnits: skips on zero/negative/null invoice price and bad ingredient data", () => {
  assert.deepEqual(compareUnits(sugarKg, { unit: "kg", unitPrice: 0, description: "" }, null), { kind: "skip", reason: "zero_price" })
  assert.deepEqual(compareUnits(sugarKg, { unit: "kg", unitPrice: -2.5, description: "" }, null), { kind: "skip", reason: "zero_price" })
  assert.deepEqual(compareUnits(sugarKg, { unit: "kg", unitPrice: null, description: "" }, null), { kind: "skip", reason: "zero_price" })
  assert.deepEqual(compareUnits(sugarKg, { unit: "kg", unitPrice: NaN, description: "" }, null), { kind: "skip", reason: "zero_price" })
  assert.deepEqual(
    compareUnits({ purchaseUnit: "kg", purchaseQuantity: 1, purchasePrice: 0 }, { unit: "kg", unitPrice: 3, description: "" }, null),
    { kind: "skip", reason: "missing_data" }
  )
  assert.deepEqual(
    compareUnits({ purchaseUnit: "kg", purchaseQuantity: 0, purchasePrice: 3 }, { unit: "kg", unitPrice: 3, description: "" }, null),
    { kind: "skip", reason: "missing_data" }
  )
})

test("compareUnits: same unit via synonyms is a direct compare", () => {
  const r = compareUnits(capsicumKg, { unit: "KG", unitPrice: 6.3, description: "CAPSICUM RED KG" }, null)
  assert.equal(r.kind, "same_unit")
  if (r.kind !== "same_unit") return
  assert.equal(r.storedUnitPrice, 5.88)
  assert.equal(r.invoiceUnitPrice, 6.3)
  assert.equal(round(r.changePct, 2), 7.14)
  assert.equal(round(r.changeAmount, 2), 0.42)
})

test("compareUnits: same-unit label with a pack size in the description stays same_unit", () => {
  // The description says 5kg but the line is billed per kg; do not divide by 5.
  const r = compareUnits(sugarKg, { unit: "kg", unitPrice: 2.5, description: "SUGAR Brown 5kg" }, null)
  assert.equal(r.kind, "same_unit")
})

test("compareUnits: kg invoice vs g ingredient uses the metric factor", () => {
  const r = compareUnits(butterG, { unit: "kg", unitPrice: 13.0, description: "BUTTER SALTED" }, null)
  assert.equal(r.kind, "converted")
  if (r.kind !== "converted") return
  assert.equal(r.conversionFactor, 0.001)
  assert.equal(r.conversionSource, "description")
  assert.equal(round(r.invoiceUnitPriceInStoredUnits, 5), 0.013)
  assert.equal(round(r.changePct, 2), -2.84)
})

test("compareUnits: ml ingredient vs L invoice", () => {
  const r = compareUnits(milkMl, { unit: "L", unitPrice: 2.31, description: "MILK FULL CREAM" }, null)
  assert.equal(r.kind, "converted")
  if (r.kind !== "converted") return
  assert.equal(round(r.invoiceUnitPriceInStoredUnits, 5), 0.00231)
  assert.equal(round(r.changePct, 1), 5)
})

test("compareUnits: pack-priced bag against per-kg ingredient (the sugar inversion)", () => {
  const r = compareUnits(sugarKg, { unit: "bag", unitPrice: 35.9, description: "SUGAR Brown 15kg bag" }, null)
  assert.equal(r.kind, "converted")
  if (r.kind !== "converted") return
  assert.equal(round(r.invoiceUnitPriceInStoredUnits, 4), 2.3933)
  assert.equal(round(r.changePct, 2), -11.36)
  assert.equal(r.conversionSource, "description")
})

test("compareUnits: null invoice unit with a pack size is treated as pack-priced", () => {
  const r = compareUnits(sugarKg, { unit: null, unitPrice: 4, description: "Kale 5kg" }, null)
  assert.equal(r.kind, "converted")
  if (r.kind !== "converted") return
  assert.equal(r.invoiceUnitPriceInStoredUnits, 0.8)
})

test("compareUnits: unit changed when stored unit is a carton with no base measure", () => {
  const r = compareUnits(kaleCarton, { unit: "kg", unitPrice: 9.5, description: "Kale Purple Carton 5kg" }, null)
  assert.deepEqual(r, {
    kind: "unit_changed",
    storedUnitPrice: 45,
    invoiceUnit: "kg",
    storedUnit: "carton",
    suggestedConversion: null,
  })
})

test("compareUnits: produce bunch vs ea with empty description is unit_changed", () => {
  const r = compareUnits(corianderEa, { unit: "bunch", unitPrice: 4.2, description: "" }, null)
  assert.equal(r.kind, "unit_changed")
  if (r.kind !== "unit_changed") return
  assert.equal(r.invoiceUnit, "bunch")
})

test("compareUnits: unscoped legacy factor cannot hijack a like-for-like line", () => {
  const r = compareUnits(capsicumKg, { unit: "KG", unitPrice: 6.3, description: "CAPSICUM RED KG" }, 5, null)
  assert.equal(r.kind, "same_unit")
})

test("compareUnits: unit-scoped mapping outranks a lying same-unit label", () => {
  const r = compareUnits(croissantPiece, { unit: "ea", unitPrice: 65.15, description: "Bridor Croissant Large 70g" }, 1 / 60, "EA")
  assert.equal(r.kind, "converted")
  if (r.kind !== "converted") return
  assert.equal(r.conversionSource, "mapping")
  assert.equal(round(r.invoiceUnitPriceInStoredUnits, 4), 1.0858)
  assert.equal(round(r.changePct, 2), -1.17)
})

test("compareUnits: unit-scoped mapping is ignored on a line billed in another unit", () => {
  // Butter PAT factor must not apply to the 5kg BLK line; falls to description parse.
  const r = compareUnits(butterG, { unit: "BLK", unitPrice: 83.48, description: "BUTTER SALTED ANCHOR 5kg" }, 0.002, "PAT")
  assert.equal(r.kind, "converted")
  if (r.kind !== "converted") return
  assert.equal(r.conversionSource, "description")
  assert.equal(round(r.invoiceUnitPriceInStoredUnits, 4), 0.0167)
})

test("compareUnits: zero, negative or non-finite mapping factors are ignored", () => {
  for (const bad of [0, -2, NaN, Infinity]) {
    const r = compareUnits(sugarKg, { unit: "bag", unitPrice: 30, description: "SUGAR 15kg bag" }, bad, "bag")
    assert.equal(r.kind, "converted", `factor ${bad}`)
    if (r.kind === "converted") assert.equal(r.conversionSource, "description", `factor ${bad}`)
  }
})

// ---------------------------------------------------------------- evaluatePriceChange

test("evaluatePriceChange: 1% threshold either side (per-kg)", () => {
  const under = evaluatePriceChange(capsicumKg, { unit: "kg", unitPrice: 5.93, description: "" }, null) // +0.85%
  assert.deepEqual(under, { priceChanged: false, unitChanged: false, currentPrice: null, suggestedConversionFactor: null, normalisedUnitPrice: 5.93 })
  const over = evaluatePriceChange(capsicumKg, { unit: "kg", unitPrice: 5.94, description: "" }, null) // +1.02%
  assert.deepEqual(over, { priceChanged: true, unitChanged: false, currentPrice: 5.88, suggestedConversionFactor: null, normalisedUnitPrice: 5.94 })
  const drop = evaluatePriceChange(capsicumKg, { unit: "kg", unitPrice: 5.79, description: "" }, null) // -1.5%
  assert.equal(drop.priceChanged, true)
})

test("evaluatePriceChange: per-gram ingredients need both 1% and the 0.0001 epsilon", () => {
  const perG: IngredientUnitInfo = { purchaseUnit: "g", purchaseQuantity: 1, purchasePrice: 0.01 }
  assert.equal(evaluatePriceChange(perG, { unit: "g", unitPrice: 0.010001, description: "" }, null).priceChanged, false)
  assert.equal(evaluatePriceChange(perG, { unit: "g", unitPrice: 0.0102, description: "" }, null).priceChanged, true)
})

test("evaluatePriceChange: converted line reports normalised price and description factor", () => {
  const ev = evaluatePriceChange(sugarKg, { unit: "bag", unitPrice: 35.9, description: "SUGAR Brown 15kg bag" }, null)
  assert.equal(ev.priceChanged, true)
  assert.equal(ev.unitChanged, false)
  assert.equal(ev.currentPrice, 2.7)
  assert.equal(round(ev.normalisedUnitPrice ?? 0, 4), 2.3933)
  assert.equal(ev.suggestedConversionFactor, 1 / 15)
})

test("evaluatePriceChange: mapping-sourced conversions do not re-suggest a factor", () => {
  const ev = evaluatePriceChange(croissantPiece, { unit: "ea", unitPrice: 65.15, description: "Bridor Croissant Large 70g" }, 1 / 60, "EA")
  assert.equal(ev.suggestedConversionFactor, null)
  assert.equal(round(ev.normalisedUnitPrice ?? 0, 4), 1.0858)
})

test("evaluatePriceChange: unit_changed parks the line, never a price change", () => {
  const ev = evaluatePriceChange(kaleCarton, { unit: "kg", unitPrice: 9.5, description: "Kale Purple Carton 5kg" }, null)
  assert.deepEqual(ev, { priceChanged: false, unitChanged: true, currentPrice: 45, suggestedConversionFactor: null, normalisedUnitPrice: null })
})

test("evaluatePriceChange: skip yields all-null, nothing flagged", () => {
  const ev = evaluatePriceChange(sugarKg, { unit: "kg", unitPrice: 0, description: "" }, null)
  assert.deepEqual(ev, { priceChanged: false, unitChanged: false, currentPrice: null, suggestedConversionFactor: null, normalisedUnitPrice: null })
})

// ---------------------------------------------------------------- newPurchasePriceFromComparison

test("newPurchasePriceFromComparison: scales per-unit back to purchaseQuantity", () => {
  const same = compareUnits(butterG, { unit: "g", unitPrice: 0.014, description: "" }, null)
  assert.equal(round(newPurchasePriceFromComparison(same, 500), 2), 7.0)
  const conv = compareUnits(butterG, { unit: "kg", unitPrice: 13.0, description: "BUTTER" }, null)
  assert.equal(round(newPurchasePriceFromComparison(conv, 500), 2), 6.5)
})

test("newPurchasePriceFromComparison: throws for skip and unit_changed", () => {
  assert.throws(() => newPurchasePriceFromComparison({ kind: "skip", reason: "zero_price" }, 1), /kind=skip/)
  const uc = compareUnits(kaleCarton, { unit: "kg", unitPrice: 9.5, description: "Kale Purple Carton 5kg" }, null)
  assert.throws(() => newPurchasePriceFromComparison(uc, 1), /kind=unit_changed/)
})

test("zero-quantity pack never produces a non-finite conversion", () => {
  const ev = evaluatePriceChange(sugarKg, { unit: "bag", unitPrice: 30, description: "SUGAR 0kg bag" }, null)
  assert.ok(ev.normalisedUnitPrice === null || Number.isFinite(ev.normalisedUnitPrice))
})
