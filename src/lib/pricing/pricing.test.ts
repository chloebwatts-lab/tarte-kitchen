import { test } from "node:test"
import assert from "node:assert/strict"
import { resolvePack, productKey, describeBase } from "./pack"
import { deriveObservation } from "./observation"
import { evaluateProduct, newPurchasePrice, median, byDelivery, weeklyImpact } from "./alerts"
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
  assert.equal(productKey(" 123456 ", "BUTTER SALTED", "PAT"), "code:123456")
  assert.notEqual(productKey(null, "BUTTER SALTED", "PAT"), productKey(null, "BUTTER SALTED", "BLK"))
  assert.equal(productKey(null, "Butter, Salted!", "pat"), productKey(null, "BUTTER SALTED", "PAT"))
})

test("describeBase reads naturally", () => {
  assert.equal(describeBase(5000, "WEIGHT"), "5 kg")
  assert.equal(describeBase(400, "WEIGHT"), "400 g")
  assert.equal(describeBase(6000, "VOLUME"), "6 l")
  assert.equal(describeBase(12, "COUNT"), "12 ea")
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
