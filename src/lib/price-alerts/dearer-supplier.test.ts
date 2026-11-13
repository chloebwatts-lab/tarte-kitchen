import { test } from "node:test"
import assert from "node:assert/strict"
import { findDearerBuys, type BuyLine } from "./dearer-supplier"
import type { FormRow } from "../preferred-supplier"

const WEEK_START = new Date("2026-11-04T00:00:00Z")
const WEEK_END = new Date("2026-11-10T23:59:59Z")
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function line(p: Partial<BuyLine> & { date: string; supplierName: string; description: string }): BuyLine {
  const qty = p.qty ?? 1
  const unitPrice = p.unitPrice ?? 10
  return {
    ingredientId: p.ingredientId ?? "ing",
    ingredientName: p.ingredientName ?? "Thing",
    supplierName: p.supplierName,
    productCode: p.productCode ?? null,
    description: p.description,
    unit: p.unit ?? "EA",
    venue: p.venue ?? "BURLEIGH",
    invoiceDate: d(p.date),
    qty,
    lineTotal: p.lineTotal ?? unitPrice * qty,
    unitPrice,
    effectivePrice: p.effectivePrice ?? null,
    normalisedPrice: p.normalisedPrice === undefined ? unitPrice : p.normalisedPrice,
    purchaseUnit: p.purchaseUnit ?? "kg",
  }
}

function form(p: Partial<FormRow> & { id: string; supplier: string; name: string; packPrice: number }): FormRow {
  return { packSize: null, unitPrice: p.packPrice, unit: "kg", category: null, notes: null, active: true, ...p }
}

const run = (lines: BuyLine[], forms: FormRow[] = []) => findDearerBuys({ lines, forms, weekStart: WEEK_START, weekEnd: WEEK_END })

// Real case 13 Nov 2026: Bidfood ghee $162.29 a 10L bucket ($16.229/kg,
// $15.58 net of the 4% rebate) after the forms moved ghee to Provedores at
// $149.50 ($14.95/kg). Only 4.2% dearer, so it needs the form's 3% bar.
test("ghee: 4.2% dearer but the form rules Bidfood out, so it counts", () => {
  const ghee = { ingredientId: "ghee", ingredientName: "Ghee", purchaseUnit: "kg" }
  const lines = [
    line({ ...ghee, date: "2026-10-20", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, normalisedPrice: 14.95 }),
    line({ ...ghee, date: "2026-10-27", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, normalisedPrice: 14.95 }),
    line({ ...ghee, date: "2026-11-06", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29, normalisedPrice: 16.229, venue: "BURLEIGH" }),
  ]
  const forms = [
    form({ id: "bf", supplier: "Bidfood", name: "Ghee New Zealand (Puresoul)", packPrice: 162.29, unitPrice: 16.229, unit: "L", active: false }),
    form({ id: "pv", supplier: "The Provedores", name: "Ghee Bucket 10kg (Pure Soul)", packPrice: 149.5, unitPrice: 14.95, unit: "kg" }),
  ]
  const r = run(lines, forms)
  assert.equal(r.rows.length, 1)
  const row = r.rows[0]
  assert.equal(row.boughtFrom, "Bidfood")
  assert.equal(row.cheaperFrom, "The Provedores")
  assert.equal(row.formSaysElsewhere, true)
  assert.ok(Math.abs(row.extraWeek - 6.3) < 0.01, String(row.extraWeek))
  assert.equal(r.byVenueWeek.BURLEIGH, row.extraWeek)
})

test("without a form decision, 4.2% dearer is under the 5% bar", () => {
  const lines = [
    line({ date: "2026-10-20", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unitPrice: 149.5, normalisedPrice: 14.95 }),
    line({ date: "2026-10-27", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unitPrice: 149.5, normalisedPrice: 14.95 }),
    line({ date: "2026-11-06", supplierName: "Bidfood", description: "GHEE NEW ZEALAND 10lt", unitPrice: 162.29, normalisedPrice: 16.229 }),
  ]
  assert.equal(run(lines).weekTotal, 0)
})

// Real case: Burleigh buys Marrow Meats chicken breast at $12.50/kg while
// both venues get Son Of A Bunn's at $11.
test("chicken breast: the dearer supplier's buys this week are listed with the extra", () => {
  const ck = { ingredientId: "ck", ingredientName: "Chicken breast" }
  const lines = [
    line({ ...ck, date: "2026-10-21", supplierName: "Son Of A Bunn", description: "Chicken Breast", unitPrice: 11, normalisedPrice: 11, qty: 10, venue: "BEACH_HOUSE" }),
    line({ ...ck, date: "2026-10-28", supplierName: "Son Of A Bunn", description: "Chicken Breast", unitPrice: 11, normalisedPrice: 11, qty: 10, venue: "BURLEIGH" }),
    line({ ...ck, date: "2026-11-05", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unitPrice: 12.5, normalisedPrice: 12.5, qty: 20 }),
    line({ ...ck, date: "2026-10-15", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unitPrice: 12.5, normalisedPrice: 12.5, qty: 20 }),
  ]
  const r = run(lines)
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].boughtFrom, "Marrow Meats")
  assert.equal(r.rows[0].extraWeek, 30, "20kg x $1.50 this week")
  assert.equal(r.weekTotal, 30)
  assert.equal(r.windowTotal, 60, "the 15 Oct buy counts in the 8 weeks, not the week")
  assert.equal(r.yearRate, 390)
})

test("pre-sliced against whole is a different product, not an overcharge", () => {
  const cap = { ingredientId: "cap", ingredientName: "Red capsicum" }
  const lines = [
    line({ ...cap, date: "2026-10-28", supplierName: "Pacific Wholesale", description: "CAPSICUM RED KG", unitPrice: 4.85 }),
    line({ ...cap, date: "2026-11-04", supplierName: "Pacific Wholesale", description: "CAPSICUM RED KG", unitPrice: 4.85 }),
    line({ ...cap, date: "2026-11-05", supplierName: "Coastal Fresh", description: "Capsicums - Red - Sliced", unitPrice: 14.8, qty: 10 }),
  ]
  assert.equal(run(lines).weekTotal, 0)
})

test("Bidfood's rebate is netted: creme fraiche at $11.50 is cheaper than Provedores at $11.20", () => {
  const cf = { ingredientId: "cf", ingredientName: "Creme fraiche", purchaseUnit: "g" }
  const lines = [
    line({ ...cf, date: "2026-10-28", supplierName: "Bidfood", description: "CREME FRAICHE TATUA 500gr", unitPrice: 11.5, normalisedPrice: 0.023 }),
    line({ ...cf, date: "2026-11-04", supplierName: "Bidfood", description: "CREME FRAICHE TATUA 500gr", unitPrice: 11.5, normalisedPrice: 0.023 }),
    line({ ...cf, date: "2026-10-29", supplierName: "The Provedores", description: "CREME Fraiche 500gm (6)", unitPrice: 11.2, normalisedPrice: 0.0224 }),
    line({ ...cf, date: "2026-11-05", supplierName: "The Provedores", description: "CREME Fraiche 500gm (6)", unitPrice: 11.2, normalisedPrice: 0.0224 }),
  ]
  assert.equal(run(lines).weekTotal, 0)
})

// Real case: Bidfood Queen organic vanilla paste 320g at $30.18 (~$90/kg net)
// vs Fermex Flavormaster at $53.50/kg. "Organic" keeps the invoice path from
// comparing them; the order form says Queen is not from here.
test("the order form path catches a product the invoice check cannot compare", () => {
  const v = { ingredientId: "van", ingredientName: "Vanilla bean paste", purchaseUnit: "g" }
  const lines = [
    line({ ...v, date: "2026-11-05", supplierName: "Bidfood", description: "PASTE VANILLA BEAN ORGANIC QUEEN 320gr", unit: "BTL", unitPrice: 30.18, normalisedPrice: 0.0943, qty: 2, venue: "BEACH_HOUSE" }),
    line({ ...v, date: "2026-10-28", supplierName: "Fermex", description: "FLAVORMASTER VANILLA BEAN PASTE 1KG", unit: "BTL", unitPrice: 53.5, normalisedPrice: 0.0535 }),
    line({ ...v, date: "2026-11-04", supplierName: "Fermex", description: "FLAVORMASTER VANILLA BEAN PASTE 1KG", unit: "BTL", unitPrice: 53.5, normalisedPrice: 0.0535 }),
  ]
  const forms = [
    form({ id: "q", supplier: "Bidfood", name: "Paste Vanilla Bean Organic (Queen)", packPrice: 30.18, unitPrice: 94.3125, active: false }),
    form({ id: "f", supplier: "Fermex", name: "Vanilla Bean Paste 1kg Flavormaster", packPrice: 53.5, unitPrice: 53.5 }),
  ]
  const r = run(lines, forms)
  assert.equal(r.rows.length, 1)
  const row = r.rows[0]
  assert.equal(row.formSaysElsewhere, true)
  assert.equal(row.cheaperFrom, "Fermex")
  assert.equal(row.venue, "BEACH_HOUSE")
  // per kg: 30.18 x 0.96 / 0.32 = 90.54 vs 53.50 -> 37.04/kg x 0.64kg = 23.70
  assert.ok(Math.abs(row.extraWeek - 23.71) < 0.05, String(row.extraWeek))
})

test("an active form line is never flagged by the form path", () => {
  const lines = [line({ ingredientId: null, date: "2026-11-05", supplierName: "Bidfood", description: "PASTE VANILLA BEAN ORGANIC QUEEN 320gr", unitPrice: 30.18, normalisedPrice: null })]
  const forms = [
    form({ id: "q", supplier: "Bidfood", name: "Paste Vanilla Bean Organic (Queen)", packPrice: 30.18, unitPrice: 94.3125, active: true }),
    form({ id: "f", supplier: "Fermex", name: "Vanilla Bean Paste 1kg Flavormaster", packPrice: 53.5, unitPrice: 53.5 }),
  ]
  assert.equal(run(lines, forms).weekTotal, 0)
})

test("a known quality choice (fresh spanner crab) is left out", () => {
  const crab = { ingredientId: "crab", ingredientName: "Crab Meat - Spanner", purchaseUnit: "g" }
  const lines = [
    line({ ...crab, date: "2026-10-28", supplierName: "Bidfood", description: "CRAB MEAT SPANNER CKD 500g", unitPrice: 53.58, normalisedPrice: 0.10716 }),
    line({ ...crab, date: "2026-11-04", supplierName: "Bidfood", description: "CRAB MEAT SPANNER CKD 500g", unitPrice: 53.58, normalisedPrice: 0.10716 }),
    line({ ...crab, date: "2026-11-05", supplierName: "The Fish Factory", description: "Spanner Crab Meat Cooked KG", unit: "kg", unitPrice: 129.9, normalisedPrice: 0.1299, qty: 3 }),
  ]
  assert.equal(run(lines).weekTotal, 0)
})

test("a cheaper product bought only once is not the benchmark", () => {
  const lines = [
    line({ date: "2026-10-28", supplierName: "Fermex", description: "FONDANT BAKELS 15kg", unitPrice: 4.55 }),
    line({ date: "2026-11-05", supplierName: "Bidfood", description: "FONDANT ALLIED 15kg", unitPrice: 5.33, qty: 15 }),
  ]
  assert.equal(run(lines).weekTotal, 0)
})

test("rows under $5 for the week stay off the table but count in the totals", () => {
  const lines = [
    line({ date: "2026-10-28", supplierName: "Pacific Wholesale", description: "HERB - DILL", unit: "BUN", unitPrice: 4.0, purchaseUnit: "bunch" }),
    line({ date: "2026-11-04", supplierName: "Pacific Wholesale", description: "HERB - DILL", unit: "BUN", unitPrice: 4.0, purchaseUnit: "bunch" }),
    line({ date: "2026-11-05", supplierName: "Jensens", description: "Herbs - Dill", unit: "BUN", unitPrice: 4.36, qty: 3, purchaseUnit: "bunch" }),
  ]
  const r = run(lines)
  assert.equal(r.rows.length, 0)
  assert.ok(Math.abs(r.weekTotal - 1.08) < 0.001)
})

test("no data, no rows, zero totals", () => {
  const r = run([])
  assert.deepEqual(r, { rows: [], weekTotal: 0, windowTotal: 0, yearRate: 0, byVenueWeek: {} })
})

test("a supplier whose usual price is the cheapest is not flagged on its dear days", () => {
  const leek = { ingredientId: "leek", ingredientName: "Leek", purchaseUnit: "bunch" }
  const lines = [
    line({ ...leek, date: "2026-10-20", supplierName: "Pacific Wholesale", description: "LEEK BUNCH", unitPrice: 4.2 }),
    line({ ...leek, date: "2026-10-27", supplierName: "Pacific Wholesale", description: "LEEK BUNCH", unitPrice: 4.4 }),
    line({ ...leek, date: "2026-11-05", supplierName: "Pacific Wholesale", description: "LEEK BUNCH", unitPrice: 6.6, qty: 10 }),
    line({ ...leek, date: "2026-10-21", supplierName: "Jensens", description: "Leeks (2 Stems)", unitPrice: 5.35 }),
    line({ ...leek, date: "2026-10-28", supplierName: "Jensens", description: "Leeks (2 Stems)", unitPrice: 5.35 }),
  ]
  const r = run(lines)
  assert.ok(!r.rows.some((x) => x.boughtFrom === "Pacific Wholesale"), "PW's median $4.40 is the cheapest")
})

test("butterfly portions are a different cut from whole breast", () => {
  const ck = { ingredientId: "ck", ingredientName: "Chicken breast" }
  const lines = [
    line({ ...ck, date: "2026-10-21", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unitPrice: 12.5 }),
    line({ ...ck, date: "2026-10-28", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unitPrice: 12.5 }),
    line({ ...ck, date: "2026-11-05", supplierName: "Son Of A Bunn", description: "Chicken Breast Butterfly 180g", unitPrice: 14.95, qty: 10 }),
  ]
  assert.equal(run(lines).weekTotal, 0)
})
