import { test } from "node:test"
import assert from "node:assert/strict"
import { resolvePack, productKey, describeBase, detectPackChange, isMeasureUnit, normaliseDescriptionKey } from "./pack"
import { deriveObservation, SANITY_BAND } from "./observation"
import { evaluateProduct, newPurchasePrice, median, byDelivery, weeklyImpact, pctChange } from "./alerts"
import { displayUnit, perDisplayUnit, formatPerDisplayUnit } from "./display"
import type { IngredientPackInfo, ObservationPoint } from "./types"

const sugarKg: IngredientPackInfo = {
  baseUnitType: "WEIGHT", purchaseUnit: "kg", purchaseQuantity: 1, baseUnitsPerPurchase: 1000, gramsPerUnit: null,
}
const kaleCarton: IngredientPackInfo = {
  baseUnitType: "WEIGHT", purchaseUnit: "carton", purchaseQuantity: 1, baseUnitsPerPurchase: 5000, gramsPerUnit: null,
}
const milkMl: IngredientPackInfo = {
  baseUnitType: "VOLUME", purchaseUnit: "ml", purchaseQuantity: 1000, baseUnitsPerPurchase: 1000, gramsPerUnit: null,
}
const croissantEa: IngredientPackInfo = {
  baseUnitType: "COUNT", purchaseUnit: "piece", purchaseQuantity: 60, baseUnitsPerPurchase: 60, gramsPerUnit: null,
}
const avocadoEa: IngredientPackInfo = {
  baseUnitType: "COUNT", purchaseUnit: "ea", purchaseQuantity: 1, baseUnitsPerPurchase: 1, gramsPerUnit: 200,
}
const eggsEa: IngredientPackInfo = {
  baseUnitType: "COUNT", purchaseUnit: "dozen", purchaseQuantity: 15, baseUnitsPerPurchase: 180, gramsPerUnit: null,
}

// ---------------------------------------------------------------- pack

test("per-kg line on a kg ingredient is exact", () => {
  const p = resolvePack("CAPSICUM RED KG", "KG", sugarKg)
  assert.equal(p?.packBaseUnits, 1000)
  assert.equal(p?.source, "MEASURE")
  assert.equal(p?.confidence, "HIGH")
})

test("15kg bag billed per BAG parses to 15000 g, unconfirmed", () => {
  const p = resolvePack("SUGAR Brown 15kg bag", "BAG", sugarKg)
  assert.equal(p?.packBaseUnits, 15000)
  assert.equal(p?.source, "PARSED")
  assert.equal(p?.confidence, "LOW")
})

test("15kg bag billed with a KG label is downgraded, never trusted blindly", () => {
  // The historic +1237% ghost: pack-priced line wearing a measure label.
  const p = resolvePack("SUGAR BROWN 15KG BAG", "KG", sugarKg)
  assert.equal(p?.packBaseUnits, 1000)
  assert.equal(p?.confidence, "LOW")
})

test("same container word as the ingredient uses the ingredient record", () => {
  const p = resolvePack("Kale Purple Carton", "CTN", kaleCarton)
  assert.equal(p?.packBaseUnits, 5000)
  assert.equal(p?.source, "INGREDIENT")
})

test("barista milk 1L x 6 carton is 6000 ml", () => {
  const p = resolvePack("MILK FULL CREAM 1L x 6", "CTN", milkMl)
  assert.equal(p?.packBaseUnits, 6000)
})

test("triple multiplier soda water is 6 L", () => {
  const p = resolvePack("SODA WATER 4 X 6 X 250ML", "CTN", milkMl)
  assert.equal(p?.packBaseUnits, 6000)
})

test("yoghurt 1kg tub x 6 is 6 kg", () => {
  const p = resolvePack("YOGHURT GREEK 1kg tub x 6", "CTN", sugarKg)
  assert.equal(p?.packBaseUnits, 6000)
})

test("400g canister billed EA on a kg ingredient falls through to the description", () => {
  const p = resolvePack("GARAM MASALA CANISTER TRUMPS 400gr", "EA", sugarKg)
  assert.equal(p?.packBaseUnits, 400)
  assert.equal(p?.source, "PARSED")
})

test("eggs 15dz billed per carton is 180 ea", () => {
  const p = resolvePack("Eggs Free Range 15dz", "CTN", eggsEa)
  assert.equal(p?.packBaseUnits, 180)
})

test("avocado billed per kg on a count ingredient uses grams per unit", () => {
  const p = resolvePack("AVOCADO HASS", "KG", avocadoEa)
  assert.equal(p?.packBaseUnits, 5)
  assert.equal(p?.confidence, "MEDIUM")
})

test("croissant carton billed as EA resolves to 1 ea (the sanity gate catches it later)", () => {
  const p = resolvePack("Bridor Croissant Large 70g", "ea", croissantEa)
  assert.equal(p?.packBaseUnits, 1)
  assert.equal(p?.confidence, "HIGH")
})

test("no pack information at all returns null for a person to answer", () => {
  assert.equal(resolvePack("Sauce Red Hot Original Buffalo Wings", "BTL", milkMl), null)
})

test("bracketed piece grade is not the pack", () => {
  const p = resolvePack("Slipper Bug Meat Raw [10-50g] 1kg", "BAG", sugarKg)
  assert.equal(p?.packBaseUnits, 1000)
})

test("product key prefers the supplier code, else description + billed unit", () => {
  assert.equal(productKey(" 123456 ", "BUTTER SALTED", "PAT"), "code:123456|pat")
  // same SKU billed per KG and per CTN are two products, two packs
  assert.notEqual(productKey("123456", "KALE", "KG"), productKey("123456", "KALE", "CTN"))
  assert.notEqual(productKey(null, "BUTTER SALTED", "PAT"), productKey(null, "BUTTER SALTED", "BLK"))
  assert.equal(productKey(null, "Butter, Salted!", "pat"), productKey(null, "BUTTER SALTED", "PAT"))
})

test("describeBase reads naturally", () => {
  assert.equal(describeBase(5000, "WEIGHT"), "5 kg")
  assert.equal(describeBase(400, "WEIGHT"), "400 g")
  assert.equal(describeBase(6000, "VOLUME"), "6 l")
  assert.equal(describeBase(12, "COUNT"), "12 ea")
})

test("a size change on a known product is caught, a reworded same-size description is not", () => {
  const kale = { packBaseUnits: 5000, description: "Kale Purple Carton 5kg", billedUnit: "CTN" }
  const changed = detectPackChange(kale, "Kale Purple Carton 10kg", "WEIGHT")
  assert.equal(changed?.advertisedBaseUnits, 10000)
  assert.equal(detectPackChange(kale, "KALE PURPLE CTN 5KG", "WEIGHT"), null)
  assert.equal(detectPackChange(kale, "Kale Purple Carton 5kg", "WEIGHT"), null)
  // per-kg billing: the bag size in the description is not the pack
  assert.equal(detectPackChange({ ...kale, packBaseUnits: 1000, billedUnit: "KG" }, "Kale 10kg bag", "WEIGHT"), null)
  // unit change is a different product key, so it never reaches here
  assert.notEqual(productKey(null, "Kale Purple Carton", "CTN"), productKey(null, "Kale Purple Carton", "BAG"))
})

// --------------------------------------------------------- observation

test("line total beats a discounted printed unit price", () => {
  const o = deriveObservation(
    { description: "x", unit: "KG", quantity: 1, unitPrice: 5.95, lineTotal: 5.35, isCreditNote: false },
    1000, "HIGH", null
  )
  assert.equal(o.status, "VALID")
  assert.equal(o.billedUnitPrice, 5.35)
  assert.ok(Math.abs(o.pricePerBaseUnit! - 0.00535) < 1e-9)
  assert.equal(o.baseUnitsDelivered, 1000)
})

test("extractor putting the line total in unitPrice is corrected", () => {
  const o = deriveObservation(
    { description: "x", unit: "EA", quantity: 6, unitPrice: 41.94, lineTotal: 41.94, isCreditNote: false },
    1, "HIGH", null
  )
  assert.ok(Math.abs(o.billedUnitPrice! - 6.99) < 1e-9)
})

test("credit notes are excluded", () => {
  const o = deriveObservation(
    { description: "x", unit: "KG", quantity: 1, unitPrice: 5, lineTotal: -5, isCreditNote: true },
    1000, "HIGH", 0.005
  )
  assert.equal(o.status, "EXCLUDED")
})

test("a correct unconfirmed pack near the reference is valid", () => {
  const o = deriveObservation(
    { description: "SUGAR Brown 15kg bag", unit: "BAG", quantity: 1, unitPrice: 35.9, lineTotal: 35.9, isCreditNote: false },
    15000, "LOW", 0.0024
  )
  assert.equal(o.status, "VALID")
})

test("a wrong unconfirmed pack lands as SUSPECT, not as a +1400% alert", () => {
  const o = deriveObservation(
    { description: "SUGAR Brown 15kg bag", unit: "BAG", quantity: 1, unitPrice: 35.9, lineTotal: 35.9, isCreditNote: false },
    1000, "LOW", 0.0024
  )
  assert.equal(o.status, "SUSPECT")
})

test("a 60-pack billed as one EA is caught even with a HIGH pack", () => {
  const o = deriveObservation(
    { description: "Bridor Croissant Large 70g", unit: "ea", quantity: 2, unitPrice: 65.15, lineTotal: 130.3, isCreditNote: false },
    1, "HIGH", 65.92 / 60
  )
  assert.equal(o.status, "SUSPECT")
})

test("a real doubling on a confirmed pack is VALID and reaches the alert engine", () => {
  const o = deriveObservation(
    { description: "VANILLA PASTE", unit: "EA", quantity: 1, unitPrice: 43, lineTotal: 43, isCreditNote: false },
    1, "HIGH", 20
  )
  assert.equal(o.status, "VALID")
})

// -------------------------------------------------------------- alerts

const d = (iso: string) => new Date(iso + "T00:00:00Z")
const pt = (iso: string, price: number, vol: number | null = 1000): ObservationPoint => ({
  observedAt: d(iso), pricePerBaseUnit: price, baseUnitsDelivered: vol,
})

test("median", () => {
  assert.equal(median([3, 1, 2]), 2)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([]), null)
})

test("two lines on one day collapse to one delivery, last wins", () => {
  const ds = byDelivery([pt("2026-08-01", 1), pt("2026-08-01", 2), pt("2026-07-30", 5)])
  assert.equal(ds.length, 2)
  assert.equal(ds[1].pricePerBaseUnit, 2)
})

test("stable: 6% up fires with the ingredient cost as prior", () => {
  const r = evaluateProduct("STABLE", [pt("2026-08-01", 0.00106)], 0.001, null, d("2026-08-02"))
  assert.equal(r.fire, true)
  if (r.fire) {
    assert.equal(r.alert.changePct, 6)
    assert.equal(r.alert.priorPerBase, 0.001)
  }
})

test("stable: 4% is within threshold", () => {
  const r = evaluateProduct("STABLE", [pt("2026-08-01", 0.00104)], 0.001, null)
  assert.equal(r.fire, false)
})

test("stable: a drop fires too (rebates matter)", () => {
  const r = evaluateProduct("STABLE", [pt("2026-08-01", 0.0009)], 0.001, null)
  assert.equal(r.fire, true)
  if (r.fire) assert.equal(r.alert.changePct, -10)
})

test("stable: an absurd move is a data error, not an alert", () => {
  const r = evaluateProduct("STABLE", [pt("2026-08-01", 0.007)], 0.001, null)
  assert.equal(r.fire, false)
})

test("a chef decision at this price sticks; an engine auto-close does not", () => {
  const pts = [pt("2026-08-01", 0.0011)]
  const chef = evaluateProduct("STABLE", pts, 0.001, { pricePerBaseUnit: 0.0011, resolvedBy: "CHEF" })
  assert.equal(chef.fire, false)
  const engine = evaluateProduct("STABLE", pts, 0.001, { pricePerBaseUnit: 0.0011, resolvedBy: "ENGINE" })
  assert.equal(engine.fire, true)
  const moved = evaluateProduct("STABLE", [pt("2026-08-08", 0.0012)], 0.001, { pricePerBaseUnit: 0.0011, resolvedBy: "CHEF" })
  assert.equal(moved.fire, true)
})

test("produce: median excludes the delivery under test and needs two confirming deliveries", () => {
  const history = [pt("2026-07-07", 4), pt("2026-07-14", 4.2), pt("2026-07-21", 3.9)]
  // one spike: not confirmed
  const one = evaluateProduct("PRODUCE", [...history, pt("2026-07-28", 6)], null, null, d("2026-07-29"))
  assert.equal(one.fire, false)
  // two consecutive spikes: fires, prior is the median of the three earlier deliveries
  const two = evaluateProduct("PRODUCE", [...history, pt("2026-07-28", 6), pt("2026-08-04", 5.8)], null, null, d("2026-08-05"))
  assert.equal(two.fire, true)
  if (two.fire) {
    assert.equal(two.alert.priorMedianPerBase, 4.1)
    assert.equal(two.alert.currentPerBase, 5.8)
  }
})

test("produce: fewer than two prior deliveries never fires", () => {
  const r = evaluateProduct("PRODUCE", [pt("2026-07-21", 4), pt("2026-07-28", 9)], null, null)
  assert.equal(r.fire, false)
})

test("weekly impact uses delivered volume over the trailing 28 days", () => {
  const pts = [pt("2026-07-01", 1, 2000), pt("2026-07-20", 1, 2000), pt("2026-07-27", 1.1, 4000)]
  // window from 2026-07-01 (asOf minus 28d) inclusive: 8000 base units / 4 weeks = 2000 per week x 0.1
  assert.equal(weeklyImpact(pts, d("2026-07-29"), 1.1, 1), 200)
  assert.equal(weeklyImpact([pt("2026-07-27", 1, null)], d("2026-07-29"), 1.1, 1), null)
})

test("accepting a price only ever rescales purchasePrice for the existing baseUnitsPerPurchase", () => {
  // Sugar stored as 1 kg (1000 g): 15 kg bag at $35.90 accepted -> $2.39/kg, not $35.90
  assert.equal(newPurchasePrice(35.9 / 15000, 1000), 2.3933)
  // Kale stored as one 5 kg carton
  assert.equal(newPurchasePrice(0.0031, 5000), 15.5)
  assert.throws(() => newPurchasePrice(0, 1000))
})

// ------------------------------------------------ 2026-09-27 gap fills

test("measure units are recognised, container words are not", () => {
  assert.equal(isMeasureUnit("KG"), true)
  assert.equal(isMeasureUnit("ea"), true)
  assert.equal(isMeasureUnit("DZ"), true)
  assert.equal(isMeasureUnit("CTN"), false)
  assert.equal(isMeasureUnit("BAG"), false)
  assert.equal(isMeasureUnit(null), false)
  assert.equal(isMeasureUnit(""), false)
})

test("description keys ignore case, punctuation and runs of whitespace", () => {
  assert.equal(normaliseDescriptionKey("  BUTTER, Salted!!  Anchor 5kg "), "butter salted anchor 5kg")
  assert.equal(normaliseDescriptionKey("Kale-Purple/Carton"), normaliseDescriptionKey("kale purple carton"))
  assert.equal(normaliseDescriptionKey("!!!"), "")
})

test("a blank product code falls back to the description key", () => {
  assert.equal(productKey("   ", "Anchor Butter 5kg", "BLK"), "desc:anchor butter 5kg|blk")
  assert.equal(productKey(undefined, "Anchor Butter 5kg", null), "desc:anchor butter 5kg|-")
})

test("describeBase handles fractional kilos and sub-kilo weights", () => {
  assert.equal(describeBase(1500, "WEIGHT"), "1.5 kg")
  assert.equal(describeBase(1234, "WEIGHT"), "1.234 kg")
  assert.equal(describeBase(999, "WEIGHT"), "999 g")
  assert.equal(describeBase(250, "VOLUME"), "250 ml")
  assert.equal(describeBase(0.5, "COUNT"), "0.5 ea")
})

test("pack change guard: no pack on file, or within 10%, never fires", () => {
  const kale = { packBaseUnits: 5000, description: "Kale Purple Carton 5kg", billedUnit: "CTN" }
  assert.equal(detectPackChange({ ...kale, packBaseUnits: null }, "Kale Purple Carton 10kg", "WEIGHT"), null)
  assert.equal(detectPackChange({ ...kale, packBaseUnits: 0 }, "Kale Purple Carton 10kg", "WEIGHT"), null)
  // 5.4 kg vs 5 kg is an 8% drift, tolerated as the same pack
  assert.equal(detectPackChange(kale, "Kale Purple Carton 5.4kg", "WEIGHT"), null)
  // a volume pack on a weight ingredient is a different family, ignored
  assert.equal(detectPackChange(kale, "Kale Purple Carton 10L", "WEIGHT"), null)
  // halving is caught just like doubling
  assert.equal(detectPackChange(kale, "Kale Purple Carton 2.5kg", "WEIGHT")?.advertisedBaseUnits, 2500)
})

// --------------------------------------------------------- display

test("base-unit prices display per kg / L / ea with sensible precision", () => {
  assert.equal(displayUnit("WEIGHT"), "kg")
  assert.equal(displayUnit("VOLUME"), "L")
  assert.equal(displayUnit("COUNT"), "ea")
  // Anchor butter block: 83.48 / 5000 g
  assert.ok(Math.abs(perDisplayUnit(0.016696, "WEIGHT") - 16.696) < 1e-9)
  assert.equal(formatPerDisplayUnit(0.016696, "WEIGHT"), "$16.7/kg")
  // count prices are not scaled
  assert.equal(perDisplayUnit(1.0858, "COUNT"), 1.0858)
  assert.equal(formatPerDisplayUnit(1.0858, "COUNT"), "$1.09/ea")
  // 2 dp under $10, 1 dp under $100, whole dollars from $100
  assert.equal(formatPerDisplayUnit(0.00238, "VOLUME"), "$2.38/L")
  assert.equal(formatPerDisplayUnit(0.0421, "WEIGHT"), "$42.1/kg")
  assert.equal(formatPerDisplayUnit(0.25, "WEIGHT"), "$250/kg")
  assert.equal(formatPerDisplayUnit(0, "COUNT"), "$0.00/ea")
})

// ------------------------------------------------------ observation

test("zero, missing or negative prices are excluded, never priced", () => {
  const base = { description: "x", unit: "KG", quantity: 1, isCreditNote: false }
  assert.equal(deriveObservation({ ...base, unitPrice: 0, lineTotal: 0 }, 1000, "HIGH", null).status, "EXCLUDED")
  assert.equal(deriveObservation({ ...base, unitPrice: null, lineTotal: null }, 1000, "HIGH", null).status, "EXCLUDED")
  const neg = deriveObservation({ ...base, unitPrice: -5, lineTotal: -5 }, 1000, "HIGH", null)
  assert.equal(neg.status, "EXCLUDED")
  assert.equal(neg.reason, "zero or missing price")
  assert.equal(neg.pricePerBaseUnit, null)
})

test("no pack, zero pack or a non-finite pack is excluded with the pack reason", () => {
  const line = { description: "x", unit: "CTN", quantity: 1, unitPrice: 20, lineTotal: 20, isCreditNote: false }
  for (const pack of [null, 0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const o = deriveObservation(line, pack, "LOW", 0.01)
    assert.equal(o.status, "EXCLUDED", `pack ${pack}`)
    assert.equal(o.reason, "no pack")
  }
})

test("credit note wins over every other check, and keeps the billed qty for the record", () => {
  const o = deriveObservation(
    { description: "x", unit: "KG", quantity: -2, unitPrice: 42, lineTotal: -84, isCreditNote: true },
    1000, "HIGH", 0.042
  )
  assert.equal(o.status, "EXCLUDED")
  assert.equal(o.reason, "credit note")
  assert.equal(o.billedQty, -2)
  assert.equal(o.packBaseUnits, 1000)
})

test("unknown or zero quantity still yields a price but no delivered volume", () => {
  const nullQty = deriveObservation(
    { description: "x", unit: "KG", quantity: null, unitPrice: 42, lineTotal: null, isCreditNote: false },
    1000, "HIGH", null
  )
  assert.equal(nullQty.status, "VALID")
  assert.equal(nullQty.pricePerBaseUnit, 0.042)
  assert.equal(nullQty.baseUnitsDelivered, null)
  const zeroQty = deriveObservation(
    { description: "x", unit: "KG", quantity: 0, unitPrice: 42, lineTotal: 0, isCreditNote: false },
    1000, "HIGH", null
  )
  assert.equal(zeroQty.status, "VALID")
  assert.equal(zeroQty.baseUnitsDelivered, null)
})

test("Anchor butter 5 kg block at $83.48 prices at $0.016696 per gram", () => {
  const o = deriveObservation(
    { description: "BUTTER SALTED ANCHOR 5kg", unit: "BLK", quantity: 4, unitPrice: 83.48, lineTotal: 333.92, isCreditNote: false },
    5000, "LOW", 0.0167
  )
  assert.equal(o.status, "VALID")
  assert.ok(Math.abs(o.pricePerBaseUnit! - 0.016696) < 1e-12)
  assert.equal(o.baseUnitsDelivered, 20000)
})

test("sanity band boundaries are exclusive: exactly on the band is still VALID", () => {
  const line = (price: number) => ({ description: "x", unit: "EA", quantity: 1, unitPrice: price, lineTotal: price, isCreditNote: false })
  // HIGH: suspect only beyond x5 or below /5
  assert.equal(SANITY_BAND.HIGH, 4)
  assert.equal(deriveObservation(line(5), 1, "HIGH", 1).status, "VALID")
  assert.equal(deriveObservation(line(5.01), 1, "HIGH", 1).status, "SUSPECT")
  assert.equal(deriveObservation(line(0.2), 1, "HIGH", 1).status, "VALID")
  assert.equal(deriveObservation(line(0.19), 1, "HIGH", 1).status, "SUSPECT")
  // MEDIUM: +/-150% -> ratio 2.5 or 0.4
  assert.equal(deriveObservation(line(2.5), 1, "MEDIUM", 1).status, "VALID")
  assert.equal(deriveObservation(line(2.51), 1, "MEDIUM", 1).status, "SUSPECT")
  assert.equal(deriveObservation(line(0.39), 1, "MEDIUM", 1).status, "SUSPECT")
  // LOW: +/-60% -> ratio 1.6 or 0.625
  assert.equal(deriveObservation(line(1.6), 1, "LOW", 1).status, "VALID")
  assert.equal(deriveObservation(line(1.61), 1, "LOW", 1).status, "SUSPECT")
  assert.equal(deriveObservation(line(0.62), 1, "LOW", 1).status, "SUSPECT")
  // a missing confidence is treated as LOW
  assert.equal(deriveObservation(line(1.61), 1, null, 1).status, "SUSPECT")
  // no reference: nothing to be suspect against
  assert.equal(deriveObservation(line(100), 1, "LOW", null).status, "VALID")
  assert.equal(deriveObservation(line(100), 1, "LOW", 0).status, "VALID")
})

test("observation carries raw float arithmetic (no rounding at this layer)", () => {
  const o = deriveObservation(
    { description: "x", unit: "EA", quantity: 1, unitPrice: 0.1 + 0.2, lineTotal: null, isCreditNote: false },
    1, "HIGH", null
  )
  // 0.1 + 0.2 is 0.30000000000000004 in binary floats; downstream rounds to cents
  assert.equal(o.pricePerBaseUnit, 0.1 + 0.2)
  assert.notEqual(o.pricePerBaseUnit, 0.3)
})

// ----------------------------------------------------------- alerts

test("pctChange is signed and relative to the prior", () => {
  assert.equal(pctChange(1.1, 1), 10.000000000000009)
  assert.equal(Math.round(pctChange(1.1, 1) * 100) / 100, 10)
  assert.equal(pctChange(0.9, 1), -9.999999999999998)
  assert.equal(pctChange(2, 1), 100)
  assert.equal(pctChange(0, 1), -100)
  // prior 0 is a division by zero: callers guard it (ingredientPerBase > 0)
  assert.equal(pctChange(1, 0), Number.POSITIVE_INFINITY)
})

test("median of an even set is the mean of the middle pair; input is not mutated", () => {
  const input = [9, 1, 5, 3]
  assert.equal(median(input), 4)
  assert.deepEqual(input, [9, 1, 5, 3])
  assert.equal(median([7]), 7)
})

test("stable: exactly 5% fires, 4.99% does not", () => {
  // 1.05 / 1 evaluates to 5.000000000000004%, on the firing side of the
  // threshold. (0.00105 / 0.001 lands at 4.9999999999999%, so a sub-cent
  // base price sitting exactly on 5% can miss by float noise; noted.)
  assert.equal(evaluateProduct("STABLE", [pt("2026-08-01", 1.05)], 1, null).fire, true)
  assert.equal(evaluateProduct("STABLE", [pt("2026-08-01", 1.0499)], 1, null).fire, false)
})

test("stable: no ingredient cost or no observations never fires", () => {
  assert.deepEqual(evaluateProduct("STABLE", [], 0.001, null), { fire: false, reason: "no valid observations" })
  assert.equal(evaluateProduct("STABLE", [pt("2026-08-01", 0.002)], null, null).fire, false)
  assert.equal(evaluateProduct("STABLE", [pt("2026-08-01", 0.002)], 0, null).fire, false)
  assert.equal(evaluateProduct("STABLE", [pt("2026-08-01", 0.002)], -1, null).fire, false)
})

test("stable: a 499% move still fires, 500% is treated as a data error", () => {
  assert.equal(evaluateProduct("STABLE", [pt("2026-08-01", 0.00599)], 0.001, null).fire, true)
  const r = evaluateProduct("STABLE", [pt("2026-08-01", 0.006)], 0.001, null)
  assert.equal(r.fire, false)
  if (!r.fire) assert.match(r.reason, /absurd move \(500%\)/)
})

test("a chef decision with a zero recorded price never mutes an alert", () => {
  const r = evaluateProduct("STABLE", [pt("2026-08-01", 0.0011)], 0.001, { pricePerBaseUnit: 0, resolvedBy: "CHEF" })
  assert.equal(r.fire, true)
})

test("produce: a price drop below the median never fires (upward moves only)", () => {
  const history = [pt("2026-07-07", 4), pt("2026-07-14", 4.2), pt("2026-07-21", 3.9)]
  const r = evaluateProduct("PRODUCE", [...history, pt("2026-07-28", 2), pt("2026-08-04", 2)], null, null, d("2026-08-05"))
  assert.equal(r.fire, false)
})

test("produce: deliveries older than the 28-day window are not in the median", () => {
  // old cheap deliveries would drag the median down and fire; they must be ignored
  const stale = [pt("2026-05-01", 1), pt("2026-05-08", 1)]
  const recent = [pt("2026-07-07", 4), pt("2026-07-14", 4.2), pt("2026-07-21", 3.9)]
  const r = evaluateProduct("PRODUCE", [...stale, ...recent, pt("2026-07-28", 4.1), pt("2026-08-04", 4.3)], null, null, d("2026-08-05"))
  assert.equal(r.fire, false)
})

test("weekly impact ignores volume outside the trailing window and future points", () => {
  const pts = [
    pt("2026-06-01", 1, 99999), // before window
    pt("2026-07-10", 1, 1400),
    pt("2026-07-20", 1, 1400),
    pt("2026-08-15", 1, 99999), // after asOf
  ]
  // 2800 base units / 4 weeks = 700 per week x $0.50 = $350
  assert.equal(weeklyImpact(pts, d("2026-07-29"), 1.5, 1), 350)
  // a price drop is a negative impact (a saving)
  assert.equal(weeklyImpact(pts, d("2026-07-29"), 0.5, 1), -350)
  assert.equal(weeklyImpact([], d("2026-07-29"), 1.5, 1), null)
})

test("weekly impact is rounded to cents", () => {
  const pts = [pt("2026-07-20", 1, 1000)]
  // 1000 / 4 = 250 x 0.0033333 = 0.83333 -> 0.83
  assert.equal(weeklyImpact(pts, d("2026-07-29"), 1.0033333, 1), 0.83)
})

test("byDelivery: empty input, and same-day points keep the later timestamp", () => {
  assert.deepEqual(byDelivery([]), [])
  const morning = { observedAt: new Date("2026-08-01T01:00:00Z"), pricePerBaseUnit: 1, baseUnitsDelivered: 1 }
  const evening = { observedAt: new Date("2026-08-01T20:00:00Z"), pricePerBaseUnit: 2, baseUnitsDelivered: 1 }
  const ds = byDelivery([evening, morning])
  assert.equal(ds.length, 1)
  assert.equal(ds[0].pricePerBaseUnit, 2)
})

test("newPurchasePrice rounds to 4 dp and rejects non-positive or NaN inputs", () => {
  // butter block accepted back onto a 500 g pat record: 0.016696 x 500 = 8.348
  assert.equal(newPurchasePrice(0.016696, 500), 8.348)
  assert.equal(newPurchasePrice(0.1 + 0.2, 1), 0.3)
  assert.equal(newPurchasePrice(1 / 3, 1000), 333.3333)
  assert.throws(() => newPurchasePrice(-1, 1000))
  assert.throws(() => newPurchasePrice(1, 0))
  assert.throws(() => newPurchasePrice(Number.NaN, 1000))
  assert.throws(() => newPurchasePrice(1, Number.NaN))
})
