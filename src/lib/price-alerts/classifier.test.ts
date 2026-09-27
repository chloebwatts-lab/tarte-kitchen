import { test } from "node:test"
import assert from "node:assert/strict"
import {
  streamForCategory,
  STABLE_FLAG_THRESHOLD_PCT,
  PRODUCE_FLAG_THRESHOLD_PCT,
  PRODUCE_CONFIRMATION_DELIVERIES,
  PRODUCE_WINDOW_WEEKS,
} from "./classifier"
import { evaluatePriceChange } from "../invoices/units"
import type { IngredientCategory } from "../../generated/prisma/client"

const PRODUCE: IngredientCategory[] = ["VEGETABLE", "FRUIT", "HERB", "MUSHROOM", "SALAD"]
const STABLE: IngredientCategory[] = [
  "MEAT", "SEAFOOD", "DAIRY", "CHEESE", "SPICE", "DRY_GOOD", "GRAIN", "FLOUR", "OIL",
  "VINEGAR", "BREAD", "BAKERY", "EGG", "CONDIMENT", "FROZEN", "OTHER",
]

test("streamForCategory: the five produce categories go to PRODUCE", () => {
  for (const c of PRODUCE) assert.equal(streamForCategory(c), "PRODUCE", c)
})

test("streamForCategory: everything else is STABLE (incl. EGG, FROZEN, OTHER)", () => {
  for (const c of STABLE) assert.equal(streamForCategory(c), "STABLE", c)
})

test("thresholds are pinned; changing them is a deliberate business decision", () => {
  assert.equal(STABLE_FLAG_THRESHOLD_PCT, 5)
  assert.equal(PRODUCE_FLAG_THRESHOLD_PCT, 25)
  assert.equal(PRODUCE_CONFIRMATION_DELIVERIES, 2)
  assert.equal(PRODUCE_WINDOW_WEEKS, 4)
})

// The produce exclusion rule (processor.ts): a produce line whose units cannot
// be reconciled must NOT enter the unit-review queue; produce alerts only on
// like-for-like (same unit or confirmed conversion). The rule lives inline in
// processInvoice, so this pins its two inputs and the composed outcome.
function applyProduceGate(category: IngredientCategory, ev: ReturnType<typeof evaluatePriceChange>) {
  let unitChanged = ev.unitChanged
  let suggestedConversionFactor = ev.suggestedConversionFactor
  if (unitChanged && streamForCategory(category) === "PRODUCE") {
    unitChanged = false
    suggestedConversionFactor = null
  }
  return { ...ev, unitChanged, suggestedConversionFactor }
}

test("produce rule: tray-one-week bunch-the-next never enters the unit-review queue", () => {
  const coriander = { purchaseUnit: "ea", purchaseQuantity: 1, purchasePrice: 3.5 }
  const ev = evaluatePriceChange(coriander, { unit: "bunch", unitPrice: 4.2, description: "CORIANDER BUNCH" }, null)
  assert.equal(ev.unitChanged, true) // units.ts alone would park it
  const gated = applyProduceGate("HERB", ev)
  assert.equal(gated.unitChanged, false)
  assert.equal(gated.priceChanged, false)
  assert.equal(gated.suggestedConversionFactor, null)
  assert.equal(gated.normalisedUnitPrice, null)
})

test("produce rule: same-unit produce still alerts like-for-like", () => {
  const capsicum = { purchaseUnit: "kg", purchaseQuantity: 1, purchasePrice: 5.88 }
  const ev = evaluatePriceChange(capsicum, { unit: "KG", unitPrice: 7.5, description: "CAPSICUM RED KG" }, null)
  const gated = applyProduceGate("VEGETABLE", ev)
  assert.equal(gated.priceChanged, true)
  assert.equal(gated.unitChanged, false)
  assert.equal(gated.normalisedUnitPrice, 7.5)
})

test("produce rule: confirmed mapping conversion on produce is like-for-like too", () => {
  const kaleCarton = { purchaseUnit: "carton", purchaseQuantity: 1, purchasePrice: 45 }
  const ev = evaluatePriceChange(kaleCarton, { unit: "kg", unitPrice: 9.5, description: "Kale Purple Carton 5kg" }, 5, "kg")
  const gated = applyProduceGate("VEGETABLE", ev)
  assert.equal(gated.priceChanged, true)
  assert.equal(gated.unitChanged, false)
  assert.equal(gated.normalisedUnitPrice, 47.5)
})

test("produce rule: stable categories keep the unit-review flag", () => {
  const butterG = { purchaseUnit: "g", purchaseQuantity: 500, purchasePrice: 6.69 }
  const ev = evaluatePriceChange(butterG, { unit: "BLK", unitPrice: 83.48, description: "BUTTER SALTED ANCHOR" }, null)
  assert.equal(ev.unitChanged, true)
  const gated = applyProduceGate("DAIRY", ev)
  assert.equal(gated.unitChanged, true)
  assert.equal(Math.round((gated.currentPrice ?? 0) * 1e6) / 1e6, 0.01338)
})
