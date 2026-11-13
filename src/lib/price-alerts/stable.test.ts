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
    unit: p.unit ?? null,
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
  // 4 weeks from 16 Oct: 4 pats lines (19 Oct, 29 Oct, 1 Nov, 5 Nov) at
  // 8,000g each = 32,000g = 8,000g/wk x $0.00106/g = $8.48/wk. The Anchor
  // block is its own product and adds nothing.
  assert.equal(m.weeklyImpactDollars, 8.48)
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

// ---------------------------------------------------------- guard additions

test("the same product code at two suppliers is two products, not one flip-flopping series", () => {
  const lines = [
    line({ date: "2026-10-20", price: 10, productCode: "125104" }),
    line({ date: "2026-10-21", price: 11, productCode: "125104", supplierName: "Fermex" }),
    line({ date: "2026-10-27", price: 10, productCode: "125104" }),
    line({ date: "2026-10-28", price: 11, productCode: "125104", supplierName: "Fermex" }),
    line({ date: "2026-11-03", price: 10, productCode: "125104" }),
    line({ date: "2026-11-04", price: 11, productCode: "125104", supplierName: "Fermex" }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
})

test("two lines on one invoice date are one delivery, so they cannot confirm a move alone", () => {
  const lines = [
    line({ date: "2026-10-20", price: 9.4 }),
    line({ date: "2026-10-27", price: 9.4 }),
    line({ date: "2026-11-09", price: 10.25 }),
    line({ date: "2026-11-09", price: 10.25 }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
  // a second delivery date confirms it
  const m = findStableMove([...lines, line({ date: "2026-11-11", price: 10.25 })], NOW)
  assert.ok(m)
  assert.equal(m.prior, 9.4)
  assert.equal(m.changedAt.toISOString().slice(0, 10), "2026-11-09")
})

test("the old price can be months back; only the new price must be inside 4 weeks", () => {
  const lines = [
    line({ date: "2026-08-20", price: 0.0224, supplierName: "The Provedores", description: "CREME Fraiche 500gm (6)" }),
    line({ date: "2026-11-02", price: 0.0246, supplierName: "The Provedores", description: "CREME Fraiche 500gm (6)" }),
    line({ date: "2026-11-09", price: 0.0246, supplierName: "The Provedores", description: "CREME Fraiche 500gm (6)" }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.supplierName, "The Provedores")
  assert.equal(m.prior, 0.0224)
  assert.equal(m.changePct, 9.82)
})

test("rounding jitter under 0.5% is the same price, on either side of the move", () => {
  // $8.78 per 500g printed as 0.01756 one week and 0.017561 the next
  const jitter = [
    line({ date: "2026-10-20", price: 0.01756 }),
    line({ date: "2026-10-27", price: 0.017561 }),
    line({ date: "2026-11-03", price: 0.01756 }),
  ]
  assert.equal(findStableMove(jitter, NOW), null)
  const m = findStableMove(
    [
      line({ date: "2026-10-01", price: 0.0165 }),
      line({ date: "2026-10-08", price: 0.016501 }),
      line({ date: "2026-11-01", price: 0.01756 }),
      line({ date: "2026-11-05", price: 0.017561 }),
    ],
    NOW
  )
  assert.ok(m, "jitter inside the new run still confirms on 2 deliveries")
  assert.equal(m.prior, 0.016501)
  assert.equal(m.current, 0.017561)
})

test("exactly 5% is a move, just under 5% is not", () => {
  const at = (price: number) => [
    line({ date: "2026-10-01", price: 20 }),
    line({ date: "2026-11-01", price }),
    line({ date: "2026-11-08", price }),
  ]
  assert.equal(findStableMove(at(21), NOW)?.changePct, 5)
  assert.equal(findStableMove(at(20.99), NOW), null)
  assert.equal(findStableMove(at(19), NOW)?.changePct, -5)
})

test("zero, negative and NaN prices are ignored, not treated as a price", () => {
  const lines = [
    line({ date: "2026-10-01", price: 10 }),
    line({ date: "2026-10-08", price: 10 }),
    line({ date: "2026-10-30", price: 0 }), // free goods line
    line({ date: "2026-11-01", price: -10 }), // credit-style line
    line({ date: "2026-11-02", price: Number.NaN }),
    line({ date: "2026-11-03", price: 11 }),
    line({ date: "2026-11-10", price: 11 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.prior, 10)
  assert.equal(m.current, 11)
  assert.equal(m.changedAt.toISOString().slice(0, 10), "2026-11-03")
  assert.equal(findStableMove([], NOW), null)
})

test("impact is per week in dollars: units = lineTotal / price, 4-week window only", () => {
  // Bridor croissant carton of 60, per piece $1.05 to $1.15, 3 cartons in window
  const lines = [
    line({ date: "2026-09-01", price: 1.05, description: "Croissant Bridor 60", lineTotal: 63 }), // outside window
    line({ date: "2026-10-20", price: 1.05, description: "Croissant Bridor 60", lineTotal: 63 }),
    line({ date: "2026-11-03", price: 1.15, description: "Croissant Bridor 60", lineTotal: 69 }),
    line({ date: "2026-11-10", price: 1.15, description: "Croissant Bridor 60", lineTotal: 69 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  // 180 pieces in window / 4 weeks = 45/wk x $0.10 = $4.50/wk
  assert.equal(m.weeklyImpactDollars, 4.5)
  // no line totals at all: impact unknown, not $0
  const noTotals = findStableMove(lines.map((l) => ({ ...l, lineTotal: null })), NOW)
  assert.ok(noTotals)
  assert.equal(noTotals.weeklyImpactDollars, null)
})

test("a move with dollars attached outranks a bigger % move with no volume", () => {
  const lines = [
    line({ date: "2026-10-01", price: 10, description: "A", lineTotal: 100 }),
    line({ date: "2026-10-30", price: 10.6, description: "A", lineTotal: 106 }),
    line({ date: "2026-11-06", price: 10.6, description: "A", lineTotal: 106 }),
    line({ date: "2026-10-01", price: 10, description: "B" }),
    line({ date: "2026-10-30", price: 14, description: "B" }),
    line({ date: "2026-11-06", price: 14, description: "B" }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.changePct, 6)
  // among moves without volume, the bigger % wins
  const noVol = findStableMove(lines.map((l) => ({ ...l, lineTotal: null })), NOW)
  assert.ok(noVol)
  assert.equal(noVol.changePct, 40)
})

test("a description carried by two codes is ambiguous: uncoded lines keep their own key", () => {
  const keys = productKeys([
    line({ date: "2026-08-20", price: 0.0165, description: "BUTTER SALTED" }),
    line({ date: "2026-09-20", price: 0.0165, description: "BUTTER SALTED", productCode: "125104" }),
    line({ date: "2026-09-21", price: 0.0178, description: "BUTTER SALTED", productCode: "6957" }),
  ])
  assert.equal(keys[0], "Bidfood|desc:butter salted|")
  assert.equal(keys[1], "Bidfood|code:125104")
  assert.equal(keys[2], "Bidfood|code:6957")
})

// Test-guard finds, 13 Nov 2026.
test("one late invoice at the old price folds into the run; the rise still shows", () => {
  const lines = [
    line({ date: "2026-09-29", price: 10 }),
    line({ date: "2026-10-06", price: 10 }),
    line({ date: "2026-10-13", price: 10 }),
    line({ date: "2026-10-20", price: 11 }),
    line({ date: "2026-10-27", price: 10 }), // billed at the old price once
    line({ date: "2026-11-03", price: 11 }),
    line({ date: "2026-11-10", price: 11 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m, "the rise must not be lost for good")
  assert.equal(m.prior, 10)
  assert.equal(m.current, 11)
  assert.equal(m.changedAt.toISOString().slice(0, 10), "2026-10-20")
})

test("a one-delivery promo just before a rise is not the Was price", () => {
  const lines = [
    line({ date: "2026-10-01", price: 10 }),
    line({ date: "2026-10-08", price: 10 }),
    line({ date: "2026-10-22", price: 9 }), // promo
    line({ date: "2026-10-29", price: 11 }),
    line({ date: "2026-11-05", price: 11 }),
  ]
  const m = findStableMove(lines, NOW)
  assert.ok(m)
  assert.equal(m.prior, 10)
  assert.equal(m.changePct, 10)
})

test("uncoded lines with one description but different billed units are different products", () => {
  const lines = [
    line({ date: "2026-10-20", price: 0.0165, description: "BUTTER SALTED", unit: "PAT" }),
    line({ date: "2026-10-27", price: 0.0165, description: "BUTTER SALTED", unit: "PAT" }),
    line({ date: "2026-11-03", price: 0.01777, description: "BUTTER SALTED", unit: "BLK" }),
    line({ date: "2026-11-10", price: 0.01777, description: "BUTTER SALTED", unit: "BLK" }),
  ]
  assert.equal(findStableMove(lines, NOW), null)
  const keys = productKeys(lines)
  assert.notEqual(keys[0], keys[2])
})
