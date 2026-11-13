import { test } from "node:test"
import assert from "node:assert/strict"
import { matchQuote, planCardSync, type CardIngredient, type QuoteRow, type SyncLine } from "./card-sync"

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
    lineTotal: p.lineTotal ?? p.billedPrice * 10,
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
