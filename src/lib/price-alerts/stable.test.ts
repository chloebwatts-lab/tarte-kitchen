import { test } from "node:test"
import assert from "node:assert/strict"
import { findStableMove, productKeys, normaliseDescription, type StableLine } from "./stable"

const NOW = new Date("2026-11-13T00:00:00Z")
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function line(p: Partial<StableLine> & { date: string; price: number }): StableLine {
  return {
    supplierName: p.supplierName ?? "Bidfood",
    productCode: p.productCode ?? null,
    description: p.description ?? "BUTTER SALTED YARDE FARM 500gr",
    venue: p.venue ?? "BURLEIGH",
    invoiceDate: d(p.date),
    price: p.price,
    lineTotal: p.lineTotal ?? null,
  }
}

test("normaliseDescription strips bracketed codes, case and punctuation", () => {
  assert.equal(normaliseDescription("[BUTTERNZ] BUTTER UNSALTED NZ 25KG"), "butter unsalted nz 25kg")
  assert.equal(normaliseDescription("Creme  Fraiche - 500gm (6)"), "creme fraiche 500gm 6")
})

test("old uncoded lines inherit the code their description later carried", () => {
  const keys = productKeys([
    line({ date: "2026-08-20", price: 0.0165, description: "BUTTER SALTED" }),
    line({ date: "2026-09-20", price: 0.0165, description: "BUTTER SALTED", productCode: "125104" }),
    line({ date: "2026-09-21", price: 0.0165, description: "Butter Salted Yarde Farm 500gr", productCode: "125104" }),
  ])
  assert.equal(keys[0], "Bidfood|code:125104")
  assert.equal(keys[1], keys[0])
  assert.equal(keys[2], keys[0])
})

// Real case, 13 Nov 2026: Bidfood Yarde Farm salted butter pats went
// $8.25 to $8.78 (per 500g) from 1 Nov; the Anchor 5kg block stayed at
// $88.84. The digest said +31% vs a $6.69 cost card; the real move is +6.4%.
test("salted butter: real +6.4% vs the previous price paid, not the card", () => {
  const lines: StableLine[] = [
    line({ date: "2026-10-02", price: 0.0165, description: "BUTTER SALTED", lineTotal: 132 }),
    line({ date: "2026-10-19", price: 0.0165, productCode: "125104", lineTotal: 132 }),
    line({ date: "2026-10-29", price: 0.0165, productCode: "125104", lineTotal: 132 }),
    line({ date: "2026-10-30", price: 0.017768, productCode: "6957", description: "BUTTER SALTED ANCHOR 5kg", lineTotal: 88.84 }),
    line({ date: "2026-11-01", price: 0.01756, productCode: "125104", description: "BUTTER SALTED", lineTotal: 140.48 }),
    line({ date: "2026-11-05", price: 0.01756, productCode: "125104", lineTotal: 140.48 }),
    line({ date: "2026-11-10", price: 0.017768, productCode: "6957", description: "BUTTER SALTED ANCHOR 5kg", lineTotal: 88.84 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.supplierName, "Bidfood")
  assert.equal(m.prior, 0.0165)
  assert.equal(m.current, 0.01756)
  assert.equal(m.changePct, 6.42)
  assert.equal(m.changedAt.toISOString().slice(0, 10), "2026-11-01")
  // 4 weeks: 3 pats lines at 8000g each ≈ 24,000g = 6,000g/wk x $0.00106
  assert.ok(m.weeklyImpactDollars! > 5 && m.weeklyImpactDollars! < 10, String(m.weeklyImpactDollars))
})

test("a price that has not moved is not an alert, whatever the card says", () => {
  const lines = ["2026-10-20", "2026-10-27", "2026-11-03", "2026-11-11"].map((date) =>
    line({ date, price: 0.0224, supplierName: "The Provedores", description: "CREME Fraiche 500gm (6)", lineTotal: 67.2 })
  )
  assert.equal(findStableMove(lines, NOW), null)
})

test("different pack formats from one supplier are never compared", () => {
  const lines = [
    line({ date: "2026-10-20", price: 0.0067, supplierName: "Pixel Bread", description: "WHITE Sourdough 1400g" }),
    line({ date: "2026-10-21", price: 0.0067, supplierName: "Pixel Bread", description: "WHITE Sourdough 1400g" }),
    line({ date: "2026-11-01", price: 0.0074, supplierName: "Pixel Bread", description: "WHITE Sourdough 850g" }),
    line({ date: "2026-11-02", price: 0.0074, supplierName: "Pixel Bread", description: "WHITE Sourdough 850g" }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("one delivery at a new price is not confirmed yet", () => {
  const lines = [
    line({ date: "2026-10-20", price: 9.4 }),
    line({ date: "2026-10-27", price: 9.4 }),
    line({ date: "2026-11-09", price: 10.25 }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("a move that first landed more than 4 weeks ago is history, not news", () => {
  const lines = [
    line({ date: "2026-08-04", price: 12.16 }),
    line({ date: "2026-08-11", price: 10.8 }),
    line({ date: "2026-09-22", price: 10.8 }),
    line({ date: "2026-11-10", price: 10.8 }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("a one-delivery blip between runs of the same price is not a move", () => {
  const lines = [
    line({ date: "2026-10-20", price: 8.25 }),
    line({ date: "2026-10-22", price: 8.25 }),
    line({ date: "2026-10-27", price: 7.5 }),
    line({ date: "2026-11-03", price: 8.25 }),
    line({ date: "2026-11-10", price: 8.25 }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("two venues on different prices do not flip-flop into a move", () => {
  const lines = [
    line({ date: "2026-10-20", price: 10, venue: "BURLEIGH" }),
    line({ date: "2026-10-21", price: 11, venue: "BEACH_HOUSE" }),
    line({ date: "2026-10-27", price: 10, venue: "BURLEIGH" }),
    line({ date: "2026-10-28", price: 11, venue: "BEACH_HOUSE" }),
    line({ date: "2026-11-03", price: 10, venue: "BURLEIGH" }),
    line({ date: "2026-11-04", price: 11, venue: "BEACH_HOUSE" }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("the same move at both venues adds both venues' volume", () => {
  const mk = (venue: string) => [
    line({ date: "2026-10-01", price: 10, venue, lineTotal: 100 }),
    line({ date: "2026-10-08", price: 10, venue, lineTotal: 100 }),
    line({ date: "2026-10-27", price: 11, venue, lineTotal: 110 }),
    line({ date: "2026-11-03", price: 11, venue, lineTotal: 110 }),
  ]
  const m = findStableMove([...mk("BURLEIGH"), ...mk("BEACH_HOUSE")], NOW)
  assert.ok(m)
  assert.equal(m.changePct, 10)
  // per venue: 20 units in window / 4 weeks = 5/wk x $1 = $5; two venues = $10
  assert.equal(m.weeklyImpactDollars, 10)
})

test("a drop of 5%+ is a saving with negative impact", () => {
  const lines = [
    line({ date: "2026-10-01", price: 20, lineTotal: 200 }),
    line({ date: "2026-10-30", price: 18, lineTotal: 180 }),
    line({ date: "2026-11-06", price: 18, lineTotal: 180 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.changePct, -10)
  assert.ok(m.weeklyImpactDollars! < 0)
})

test("moves under 5% stay quiet", () => {
  const lines = [
    line({ date: "2026-10-01", price: 51.8 }),
    line({ date: "2026-10-30", price: 53.5 }),
    line({ date: "2026-11-06", price: 53.5 }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("the biggest dollar move across suppliers wins", () => {
  const lines = [
    line({ date: "2026-10-01", price: 10, supplierName: "Fermex", description: "A", lineTotal: 100 }),
    line({ date: "2026-10-30", price: 11, supplierName: "Fermex", description: "A", lineTotal: 1100 }),
    line({ date: "2026-11-06", price: 11, supplierName: "Fermex", description: "A", lineTotal: 1100 }),
    line({ date: "2026-10-01", price: 10, supplierName: "Bidfood", description: "B", lineTotal: 10 }),
    line({ date: "2026-10-30", price: 15, supplierName: "Bidfood", description: "B", lineTotal: 15 }),
    line({ date: "2026-11-06", price: 15, supplierName: "Bidfood", description: "B", lineTotal: 15 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.supplierName, "Fermex")
})
