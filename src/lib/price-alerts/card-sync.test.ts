import { test } from "node:test"
import assert from "node:assert/strict"
import { matchQuote, planCardSync, produceMedian, quoteBasisPrice, type CardIngredient, type QuoteRow, type SyncLine } from "./card-sync"

const NOW = new Date("2026-11-13T00:00:00Z")
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function line(p: Partial<SyncLine> & { date: string; price: number; billedPrice: number }): SyncLine {
  return {
    supplierName: p.supplierName ?? "Bidfood",
    productCode: p.productCode ?? null,
    description: p.description ?? "BUTTER SALTED YARDE FARM 500gr",
    unit: p.unit ?? "PAT",
    venue: p.venue ?? "BURLEIGH",
    invoiceDate: d(p.date),
    price: p.price,
    lineTotal: p.lineTotal !== undefined ? p.lineTotal : p.billedPrice * 10, // null = no line total on the invoice
    billedPrice: p.billedPrice,
  }
}

const BUTTER: CardIngredient = { id: "butter", name: "Salted butter", purchasePrice: 6.69, purchaseQuantity: 500, purchaseUnit: "g" }
const YARDE_QUOTE: QuoteRow = { id: "q1", supplierName: "Bidfood", name: "Butter Salted Yardefarm 500g", packPrice: 8.25, unit: "kg", unitPrice: 16.5 }
const ANCHOR_QUOTE: QuoteRow = { id: "q2", supplierName: "Bidfood", name: "Butter Salted (Anchor)", packPrice: 88.84, unit: "kg", unitPrice: 17.768 }

function plan(ingredients: CardIngredient[], lines: Record<string, SyncLine[]>, quotes: QuoteRow[] = [], manual: string[] = []) {
  return planCardSync({ ingredients, lines: new Map(Object.entries(lines)), quotes, manuallyChanged: new Set(manual), now: NOW })
}

// Real case, 13 Nov 2026: Bidfood moved Yarde Farm pats $8.25 to $8.78 on
// 1 Nov with no notice; the order form (latest quote) still says $8.25.
test("charged above quote: the card takes the quote and the gap is listed", () => {
  const lines = [
    line({ date: "2026-10-20", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-10-27", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-11-01", price: 0.01756, billedPrice: 8.78 }),
    line({ date: "2026-11-08", price: 0.01756, billedPrice: 8.78 }),
  ]
  const p = plan([BUTTER], { butter: lines }, [YARDE_QUOTE, ANCHOR_QUOTE])
  assert.equal(p.aboveQuote.length, 1)
  const a = p.aboveQuote[0]
  assert.equal(a.quoteName, "Butter Salted Yardefarm 500g")
  assert.equal(a.pct, 6.42)
  assert.ok(Math.abs(a.quoted - 0.0165) < 1e-6)
  assert.ok(a.weeklyGapDollars! > 0)
  assert.equal(p.updates.length, 1)
  assert.equal(p.updates[0].newPrice, 8.25, "card held at the quoted $8.25 a pat, not the $8.78 charged")
})

test("charged at or below quote: the card follows the invoice", () => {
  const card = { ...BUTTER, purchasePrice: 9.5 }
  const lines = [
    line({ date: "2026-10-27", price: 0.016, billedPrice: 8.0 }),
    line({ date: "2026-11-03", price: 0.016, billedPrice: 8.0 }),
  ]
  const p = plan([card], { butter: lines }, [YARDE_QUOTE])
  assert.equal(p.aboveQuote.length, 0)
  assert.equal(p.updates[0].newPrice, 8)
})

test("no quote on file: the card follows the settled invoice price", () => {
  const card = { ...BUTTER, purchasePrice: 6.69 }
  const lines = [
    line({ date: "2026-10-27", price: 0.0176, billedPrice: 8.8, supplierName: "Fermex" }),
    line({ date: "2026-11-03", price: 0.0176, billedPrice: 8.8, supplierName: "Fermex" }),
  ]
  const p = plan([card], { butter: lines }, [YARDE_QUOTE])
  assert.equal(p.aboveQuote.length, 0, "a Bidfood quote never audits a Fermex line")
  assert.equal(p.updates[0].newPrice, 8.8)
})

test("a new price on one delivery does not move the card yet", () => {
  const card = { ...BUTTER, purchasePrice: 8.25 }
  const lines = [
    line({ date: "2026-10-20", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-10-27", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-11-10", price: 0.0185, billedPrice: 9.25 }),
  ]
  const p = plan([card], { butter: lines })
  assert.equal(p.updates.length, 0)
  assert.equal(p.held.length, 0)
})

test("a move over 50% is held for a check, never written", () => {
  const card = { ...BUTTER, purchasePrice: 4 }
  const lines = [
    line({ date: "2026-10-27", price: 0.0176, billedPrice: 8.8 }),
    line({ date: "2026-11-03", price: 0.0176, billedPrice: 8.8 }),
  ]
  const p = plan([card], { butter: lines })
  assert.equal(p.updates.length, 0)
  assert.equal(p.held.length, 1)
  assert.match(p.held[0].reason, /120%/)
})

test("a card a person changed in the last 14 days is left alone, but the quote gap still shows", () => {
  const lines = [
    line({ date: "2026-11-01", price: 0.01756, billedPrice: 8.78 }),
    line({ date: "2026-11-08", price: 0.01756, billedPrice: 8.78 }),
  ]
  const p = plan([BUTTER], { butter: lines }, [YARDE_QUOTE], ["butter"])
  assert.equal(p.updates.length, 0)
  assert.equal(p.aboveQuote.length, 1)
})

test("changes under 2% are not written", () => {
  const card = { ...BUTTER, purchasePrice: 8.3 }
  const lines = [
    line({ date: "2026-10-27", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-11-03", price: 0.0165, billedPrice: 8.25 }),
  ]
  assert.equal(plan([card], { butter: lines }).updates.length, 0)
})

test("two suppliers blend by 8-week volume", () => {
  const card: CardIngredient = { id: "v", name: "Vanilla bean paste", purchasePrice: 14.06, purchaseQuantity: 320, purchaseUnit: "g" }
  const lines = [
    line({ date: "2026-10-27", price: 0.0535, billedPrice: 53.5, supplierName: "Fermex", description: "VANILLA PASTE 1KG", unit: "BTL", lineTotal: 535 }),
    line({ date: "2026-11-03", price: 0.0535, billedPrice: 53.5, supplierName: "Fermex", description: "VANILLA PASTE 1KG", unit: "BTL", lineTotal: 535 }),
    line({ date: "2026-10-27", price: 0.0943, billedPrice: 30.18, supplierName: "Bidfood", description: "PASTE VANILLA QUEEN 320gr", unit: "BTL", lineTotal: 30.18 }),
    line({ date: "2026-11-03", price: 0.0943, billedPrice: 30.18, supplierName: "Bidfood", description: "PASTE VANILLA QUEEN 320gr", unit: "BTL", lineTotal: 30.18 }),
  ]
  const p = plan([card], { v: lines })
  // 20,000g Fermex at 0.0535 + 640g Bidfood at 0.0943 → 0.05477/g → $17.53 per 320g
  assert.equal(p.updates.length, 1)
  assert.ok(Math.abs(p.updates[0].newPrice - 17.53) < 0.01, String(p.updates[0].newPrice))
})

test("matchQuote: needs two shared product words and the same supplier", () => {
  const prod = { supplierName: "Bidfood", description: "BUTTER SALTED YARDE FARM 500gr", billedUnit: "PAT", billedPrice: 8.78 }
  assert.equal(matchQuote(prod, [YARDE_QUOTE])?.quote.id, "q1")
  assert.equal(matchQuote({ ...prod, supplierName: "Fermex" }, [YARDE_QUOTE]), null)
  assert.equal(matchQuote({ ...prod, description: "BUTTER UNSALTED NZ" }, [{ ...YARDE_QUOTE, name: "Salted crackers" }]), null)
})

test("matchQuote: a quote for a different pack (over 1.5x away) is not a match", () => {
  const prod = { supplierName: "Bidfood", description: "BUTTER SALTED YARDE FARM 500gr", billedUnit: "PAT", billedPrice: 8.78 }
  assert.equal(matchQuote(prod, [ANCHOR_QUOTE]), null, "a $88.84 5kg block is not the quote for a $8.78 pat")
})

test("matchQuote: 'The Provedores' on the invoice matches 'The Provedores' quotes, per-kg billing compares per kg", () => {
  const q: QuoteRow = { id: "p", supplierName: "The Provedores", name: "Crème Fraîche 500g (Tatua)", packPrice: 11.2, unit: "kg", unitPrice: 22.4 }
  // accents folded, "500gm" reads as "500g", brand found in another description of the same product
  const m = matchQuote({ supplierName: "the provedores", description: ["CREME Fraiche 500gm (6)", "Creme Fraiche Tatua 500gr"], billedUnit: "INN", billedPrice: 11.2 }, [q])
  assert.equal(m?.ratio, 1)
  const perKg = matchQuote({ supplierName: "The Provedores", description: "Creme fraiche tatua 500g bulk", billedUnit: "KG", billedPrice: 23.0 }, [q])
  assert.ok(perKg && Math.abs(perKg.ratio - 23 / 22.4) < 1e-9)
})

test("matchQuote: an unpriced placeholder quote is ignored", () => {
  const q: QuoteRow = { id: "e", supplierName: "Eustralis", name: "Plain croissants large", packPrice: 0, unit: null, unitPrice: null }
  assert.equal(matchQuote({ supplierName: "Eustralis", description: "Bridor Croissant Large 70g", billedUnit: "ea", billedPrice: 65.15 }, [q]), null)
})

test("matchQuote: every quoted word must be on the invoice, brand and pack size included", () => {
  const dijon: QuoteRow = { id: "d", supplierName: "Bidfood", name: "Mustard Dijon (Frenchmaid)", packPrice: 15.57, unit: "kg", unitPrice: 7.08 }
  assert.equal(matchQuote({ supplierName: "Bidfood", description: "MUSTARD DIJON STYLE MASTERFOOD 2.5kg", billedUnit: "TUB", billedPrice: 20.93 }, [dijon]), null)
  const tub: QuoteRow = { id: "c", supplierName: "The Provedores", name: "Milk Sweetened Condensed 1.2kg (5 pack)", packPrice: 10.6, unit: "kg", unitPrice: 8.83 }
  assert.equal(matchQuote({ supplierName: "The Provedores", description: "MILK Sweetened Condensed 395g (12)", billedUnit: "INN", billedPrice: 4.1 }, [tub]), null)
  const flour: QuoteRow = { id: "f", supplierName: "Bidfood", name: "Flour Bakers Superb (Allied)", packPrice: 19.32, unit: "kg", unitPrice: 1.55 }
  assert.equal(matchQuote({ supplierName: "Bidfood", description: "FLOUR PLAIN WHOLEMEAL ALLIED 12.5kg", billedUnit: "BAG", billedPrice: 27.18 }, [flour]), null)
  const prosecco: QuoteRow = { id: "p", supplierName: "Bidfood", name: "De Bortoli King Valley Prosecco 11.5% (Debortoli)", packPrice: 11.52, unit: "each", unitPrice: 11.52 }
  assert.ok(matchQuote({ supplierName: "Bidfood", description: "DE BORTOLI KING VALLEY PROSECCO 11.5%", billedUnit: "BTL", billedPrice: 14.86 }, [prosecco]), "'de bortoli' covers 'debortoli'")
})

test("matchQuote: Bidfood house brands match their order-form spelling", () => {
  const q: QuoteRow = { id: "t", supplierName: "Bidfood", name: 'Tortillas Flour 10" (Catchoice)', packPrice: 4.22, unit: "each", unitPrice: 4.22 }
  assert.equal(matchQuote({ supplierName: "Bidfood", description: 'TORTILLAS FLOUR 10" CATERERS C 12\'s', billedUnit: "PKT", billedPrice: 4.22 }, [q])?.ratio, 1)
  // the 6-pack carton of 12" is far outside the band: no match, not an overcharge
  assert.equal(matchQuote({ supplierName: "Bidfood", description: 'TORTILLAS FLOUR 12" CATERERS C 6x12\'s', billedUnit: "CTN", billedPrice: 40.2 }, [q]), null)
})

// test-guard additions, 13 Nov 2026

test("a card at $0 (or below) is held, never written: no division by zero, reason says from $0", () => {
  const lines = [
    line({ date: "2026-10-27", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-11-03", price: 0.0165, billedPrice: 8.25 }),
  ]
  for (const purchasePrice of [0, -1]) {
    const p = plan([{ ...BUTTER, purchasePrice }], { butter: lines })
    assert.equal(p.updates.length, 0, `$${purchasePrice} card must not be written`)
    assert.equal(p.held.length, 1)
    assert.equal(p.held[0].changePct, Infinity)
    assert.equal(p.held[0].newPrice, 8.25)
    assert.match(p.held[0].reason, /from \$0/)
    assert.doesNotMatch(p.held[0].reason, /NaN|Infinity/)
  }
  // The route and the stored digest go through JSON: Infinity becomes null, never a crash.
  assert.equal(JSON.parse(JSON.stringify(plan([{ ...BUTTER, purchasePrice: 0 }], { butter: lines }))).held[0].changePct, null)
})

test("a card with no pack quantity is skipped, not divided by zero", () => {
  const lines = [
    line({ date: "2026-10-27", price: 0.0165, billedPrice: 8.25 }),
    line({ date: "2026-11-03", price: 0.0165, billedPrice: 8.25 }),
  ]
  for (const purchaseQuantity of [0, NaN, -500]) {
    const p = plan([{ ...BUTTER, purchaseQuantity }], { butter: lines }, [YARDE_QUOTE])
    assert.deepEqual(p, { updates: [], held: [], aboveQuote: [] })
  }
})

test("both venues charged above the same quote: one row, the weekly gaps add up, both capped at the quote", () => {
  const lines = [
    // Burleigh: 2 x 10 pats at $8.78 = 10,000g in 8 weeks
    line({ date: "2026-11-01", price: 0.01756, billedPrice: 8.78, venue: "BURLEIGH", lineTotal: 87.8 }),
    line({ date: "2026-11-08", price: 0.01756, billedPrice: 8.78, venue: "BURLEIGH", lineTotal: 87.8 }),
    // Currumbin: 2 x 5 pats at $9.10 = 5,000g
    line({ date: "2026-11-02", price: 0.0182, billedPrice: 9.1, venue: "CURRUMBIN", lineTotal: 45.5 }),
    line({ date: "2026-11-09", price: 0.0182, billedPrice: 9.1, venue: "CURRUMBIN", lineTotal: 45.5 }),
  ]
  const p = plan([BUTTER], { butter: lines }, [YARDE_QUOTE])
  assert.equal(p.aboveQuote.length, 1, "one row per ingredient and quote, not one per venue")
  // 1,250g/wk x $0.00106 + 625g/wk x $0.0017 = $1.33 + $1.06
  assert.ok(Math.abs(p.aboveQuote[0].weeklyGapDollars! - 2.39) <= 0.011, String(p.aboveQuote[0].weeklyGapDollars))
  assert.equal(p.updates.length, 1)
  assert.equal(p.updates[0].newPrice, 8.25, "neither venue's overcharge reaches the card")
})

test("one venue above quote, the other at it: only the overcharging venue is listed, the card stays at the quote", () => {
  const lines = [
    line({ date: "2026-11-01", price: 0.0165, billedPrice: 8.25, venue: "BURLEIGH", lineTotal: 82.5 }),
    line({ date: "2026-11-08", price: 0.0165, billedPrice: 8.25, venue: "BURLEIGH", lineTotal: 82.5 }),
    line({ date: "2026-11-02", price: 0.0182, billedPrice: 9.1, venue: "CURRUMBIN", lineTotal: 91 }),
    line({ date: "2026-11-09", price: 0.0182, billedPrice: 9.1, venue: "CURRUMBIN", lineTotal: 91 }),
  ]
  const p = plan([BUTTER], { butter: lines }, [YARDE_QUOTE])
  assert.equal(p.aboveQuote.length, 1)
  assert.equal(p.aboveQuote[0].pct, 10.3)
  assert.ok(Math.abs(p.aboveQuote[0].charged - 0.0182) < 1e-9)
  assert.equal(p.updates[0].newPrice, 8.25)
})

test("credit lines (negative totals) never give a product negative weight; the bought product carries the card", () => {
  const card: CardIngredient = { id: "cf", name: "Creme fraiche", purchasePrice: 11.2, purchaseQuantity: 500, purchaseUnit: "g" }
  const prov = { supplierName: "The Provedores", unit: "TUB" }
  const lines = [
    // Product A, only seen on credit lines this window
    line({ ...prov, date: "2026-10-27", price: 0.03, billedPrice: 15, productCode: "A1", description: "CREME FRAICHE PAULS 500G", lineTotal: -150 }),
    line({ ...prov, date: "2026-11-03", price: 0.03, billedPrice: 15, productCode: "A1", description: "CREME FRAICHE PAULS 500G", lineTotal: -150 }),
    // Product B, bought at $12.00 a tub
    line({ ...prov, date: "2026-10-27", price: 0.024, billedPrice: 12, productCode: "B1", description: "CREME FRAICHE TATUA 500G", lineTotal: 120 }),
    line({ ...prov, date: "2026-11-03", price: 0.024, billedPrice: 12, productCode: "B1", description: "CREME FRAICHE TATUA 500G", lineTotal: 120 }),
  ]
  const p = plan([card], { cf: lines })
  assert.equal(p.updates.length, 1)
  assert.equal(p.updates[0].newPrice, 12, "the credited product's $15 never pulls the blend, and a negative weight never flips it")
})

test("no volume on file: one product still moves the card, two products with no volume leave it alone", () => {
  const card = { ...BUTTER, purchasePrice: 8.0 }
  const pats = [
    line({ date: "2026-10-27", price: 0.0176, billedPrice: 8.8, lineTotal: null }),
    line({ date: "2026-11-03", price: 0.0176, billedPrice: 8.8, lineTotal: 0 }),
  ]
  assert.equal(plan([card], { butter: pats }).updates[0].newPrice, 8.8)
  const block = [
    line({ date: "2026-10-27", price: 0.0178, billedPrice: 88.84, unit: "BLK", description: "BUTTER SALTED ANCHOR 5KG", lineTotal: null }),
    line({ date: "2026-11-03", price: 0.0178, billedPrice: 88.84, unit: "BLK", description: "BUTTER SALTED ANCHOR 5KG", lineTotal: null }),
  ]
  const p = plan([card], { butter: [...pats, ...block] })
  assert.equal(p.updates.length, 0, "no volume to blend two packs by: never guess")
  assert.equal(p.held.length, 0)
})

test("8-week volume wins over older volume: a pack last bought 10 weeks ago does not pull the card", () => {
  const card = { ...BUTTER, purchasePrice: 8.0 }
  const lines = [
    line({ date: "2026-09-01", price: 0.02, billedPrice: 100, unit: "BLK", description: "BUTTER SALTED ANCHOR 5KG", lineTotal: 1000 }),
    line({ date: "2026-09-02", price: 0.02, billedPrice: 100, unit: "BLK", description: "BUTTER SALTED ANCHOR 5KG", lineTotal: 1000 }),
    line({ date: "2026-10-27", price: 0.0176, billedPrice: 8.8, lineTotal: 88 }),
    line({ date: "2026-11-03", price: 0.0176, billedPrice: 8.8, lineTotal: 88 }),
  ]
  assert.equal(plan([card], { butter: lines }).updates[0].newPrice, 8.8)
})

test("matchQuote: a quote whose pack size is not on the invoice never matches, even at a near price", () => {
  const q: QuoteRow = { id: "g", supplierName: "Bidfood", name: "Oil Grapeseed 1L (Chefchoice)", packPrice: 11.5, unit: "L", unitPrice: 11.5 }
  assert.equal(matchQuote({ supplierName: "Bidfood", description: "OIL GRAPESEED CHEFS CHOI 4LT", billedUnit: "BTL", billedPrice: 12 }, [q]), null)
  assert.ok(matchQuote({ supplierName: "Bidfood", description: "OIL GRAPESEED CHEFS CHOI 1LT", billedUnit: "BTL", billedPrice: 12 }, [q]))
})

test("matchQuote: a zero, negative or missing billed price never matches", () => {
  for (const billedPrice of [0, -8.25, NaN]) {
    assert.equal(matchQuote({ supplierName: "Bidfood", description: "BUTTER SALTED YARDE FARM 500gr", billedUnit: "PAT", billedPrice }, [YARDE_QUOTE]), null)
  }
})

test("matchQuote: an invoice with no supplier name never matches any quote", () => {
  assert.equal(matchQuote({ supplierName: null, description: "BUTTER SALTED YARDE FARM 500gr", billedUnit: "PAT", billedPrice: 8.78 }, [YARDE_QUOTE]), null)
})

// Gaps reported 13 Nov 2026 by test-guard, now handled.

test("stale settled price: eight newer deliveries at other prices should not leave the card on a 12-week-old price", () => {
  const avo: CardIngredient = { id: "avo", name: "Avocado", purchasePrice: 2.3, purchaseQuantity: 1, purchaseUnit: "ea" }
  const prov = { supplierName: "The Provedores", description: "AVOCADO HASS LGE", unit: "EA" }
  const lines = [
    line({ ...prov, date: "2026-08-20", price: 3.0, billedPrice: 3.0, lineTotal: 120 }),
    line({ ...prov, date: "2026-08-27", price: 3.0, billedPrice: 3.0, lineTotal: 120 }),
    ...[2.2, 2.5, 2.1, 2.6, 2.3, 2.4, 2.2, 2.45].map((pr, i) =>
      line({ ...prov, date: new Date(Date.UTC(2026, 8, 17 + i * 7)).toISOString().slice(0, 10), price: pr, billedPrice: pr, lineTotal: pr * 40 })
    ),
  ]
  const p = plan([avo], { avo: lines })
  assert.equal(p.updates.length, 0, `card moved to $${p.updates[0]?.newPrice}, a price last paid on 27 Aug`)
})

test("matchQuote: a plain quote should not audit a premium line that only adds words", () => {
  const q: QuoteRow = { id: "o", supplierName: "Bidfood", name: "Oil Olive (Cobram) 3L", packPrice: 30, unit: "L", unitPrice: 10 }
  assert.equal(matchQuote({ supplierName: "Bidfood", description: "OIL OLIVE EXTRA VIRGIN COBRAM 3LT", billedUnit: "BTL", billedPrice: 42 }, [q]), null)
})

test("settled price: one odd delivery is passed over, a blip between two runs too", () => {
  const card = { ...BUTTER, purchasePrice: 8.25 }
  const blip = [
    line({ date: "2026-10-20", price: 0.0176, billedPrice: 8.8 }),
    line({ date: "2026-10-27", price: 0.0176, billedPrice: 8.8 }),
    line({ date: "2026-11-03", price: 0.0165, billedPrice: 8.25 }), // one late invoice at the old price
    line({ date: "2026-11-10", price: 0.0176, billedPrice: 8.8 }),
  ]
  assert.equal(plan([card], { butter: blip }).updates[0]?.newPrice, 8.8)
})

test("produce follows the 4-week median, not one delivery", () => {
  const avo: CardIngredient = { id: "avo", name: "Avocado", purchasePrice: 2.0, purchaseQuantity: 1, purchaseUnit: "ea", category: "FRUIT" }
  const prov = { supplierName: "Pacific Wholesale", description: "AVOCADO HASS #20", unit: "EA" }
  const lines = [2.4, 2.2, 2.6, 2.3, 3.4].map((pr, i) =>
    line({ ...prov, date: new Date(Date.UTC(2026, 9, 20 + i * 5)).toISOString().slice(0, 10), price: pr, billedPrice: pr, lineTotal: pr * 40 })
  )
  const p = plan([avo], { avo: lines })
  assert.equal(p.updates[0]?.newPrice, 2.4, "median of 2.2, 2.3, 2.4, 2.6, 3.4")
})

test("produce on fewer than 3 delivery days in 4 weeks leaves the card alone", () => {
  const avo: CardIngredient = { id: "avo", name: "Avocado", purchasePrice: 2.0, purchaseQuantity: 1, purchaseUnit: "ea", category: "FRUIT" }
  const lines = [
    line({ supplierName: "Pacific Wholesale", description: "AVOCADO", unit: "EA", date: "2026-11-01", price: 2.6, billedPrice: 2.6 }),
    line({ supplierName: "Pacific Wholesale", description: "AVOCADO", unit: "EA", date: "2026-11-08", price: 2.6, billedPrice: 2.6 }),
  ]
  assert.equal(plan([avo], { avo: lines }).updates.length, 0)
})

test("matchQuote: lactose free milk never audits against the plain milk quote", () => {
  const q: QuoteRow = { id: "m", supplierName: "The Provedores", name: "Milk Full Cream 2L", packPrice: 3.2, unit: "L", unitPrice: 1.6 }
  assert.equal(matchQuote({ supplierName: "The Provedores", description: "MILK LACTOSE FREE FULL CREAM 2L", billedUnit: "BTL", billedPrice: 4.49 }, [q]), null)
  assert.ok(matchQuote({ supplierName: "The Provedores", description: "MILK FULL CREAM 2L", billedUnit: "BTL", billedPrice: 3.2 }, [q]))
})

test("quoteBasisPrice: wine tax on the line total is not an overcharge; a discount counts", () => {
  // Bidfood prosecco 13 Nov 2026: prints $11.52, 6 bottles total $89.16 (29% WET)
  assert.equal(quoteBasisPrice(11.52, 89.16 / 6), 11.52)
  assert.equal(quoteBasisPrice(10, 9), 9)
  assert.equal(quoteBasisPrice(10, null), 10)
})

// produceMedian edges (test-guard, 13 Nov 2026)

const avoLine = (date: string, price: number) =>
  line({ supplierName: "The Provedores", description: "AVOCADO HASS LGE", unit: "EA", date, price, billedPrice: price, lineTotal: price * 40 })

test("produceMedian: an even count averages the middle two, one wild week does not drag it", () => {
  const r = produceMedian([avoLine("2026-10-20", 2.0), avoLine("2026-10-27", 2.2), avoLine("2026-11-03", 2.4), avoLine("2026-11-10", 4.0)], NOW)
  assert.ok(r && Math.abs(r.price - 2.3) < 1e-9, String(r?.price))
  assert.equal(r?.line.invoiceDate.toISOString().slice(0, 10), "2026-11-10", "returns the newest delivery")
})

test("produceMedian: only the last 28 days count, and a future-dated line never does", () => {
  // 15 Oct is 29 days before 13 Nov: out. 16 Oct is exactly 28: in.
  const out = produceMedian([avoLine("2026-10-15", 9), avoLine("2026-10-27", 2.6), avoLine("2026-11-03", 2.2), avoLine("2026-11-10", 2.4)], NOW)
  assert.equal(out?.price, 2.4)
  const edge = produceMedian([avoLine("2026-10-16", 9), avoLine("2026-10-27", 2.6), avoLine("2026-11-03", 2.2)], NOW)
  assert.equal(edge?.price, 2.6)
  const future = produceMedian([avoLine("2026-10-27", 2.6), avoLine("2026-11-03", 2.2), avoLine("2026-12-10", 50)], NOW)
  assert.equal(future, null, "a mis-dated December invoice is not the third delivery day")
})

test("produceMedian: two lines on one day are one delivery day (the later line)", () => {
  assert.equal(produceMedian([avoLine("2026-11-03", 2.2), avoLine("2026-11-10", 2.4), avoLine("2026-11-10", 2.5)], NOW), null)
  assert.equal(produceMedian([avoLine("2026-10-27", 2.6), avoLine("2026-11-03", 2.2), avoLine("2026-11-10", 9), avoLine("2026-11-10", 2.4)], NOW)?.price, 2.4)
})
