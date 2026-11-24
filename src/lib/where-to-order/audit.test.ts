import { test } from "node:test"
import assert from "node:assert/strict"
import { auditWeek, formDrift, learnPacks, priceBasis, verdict, type AuditLine } from "./audit"
import { ruleFor, SHEET, sheetRows, DEPTS } from "./sheet"
import { renderWhereToOrderEmail } from "./email"

const WEEK_START = new Date("2026-11-11T00:00:00Z")
const WEEK_END = new Date("2026-11-17T23:59:59.999Z")
const LATE_SINCE = new Date("2026-11-19T04:00:00Z")
const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

function line(p: Partial<AuditLine> & { date: string; supplierName: string; description: string }): AuditLine {
  const qty = p.qty ?? 1
  const unitPrice = p.unitPrice ?? 10
  return {
    supplierName: p.supplierName,
    description: p.description,
    unit: p.unit ?? "EA",
    venue: p.venue ?? "BURLEIGH",
    invoiceDate: d(p.date),
    receivedAt: p.receivedAt ?? new Date(`${p.date}T06:00:00Z`),
    qty,
    lineTotal: p.lineTotal ?? unitPrice * qty,
    unitPrice,
    effectivePrice: p.effectivePrice ?? null,
  }
}

const run = (lines: AuditLine[]) => auditWeek({ lines, weekStart: WEEK_START, weekEnd: WEEK_END, lateSince: LATE_SINCE })
const id = (desc: string) => ruleFor(desc)?.id ?? null

// ─── Which sheet row a description is ─────────────────────────────

test("frozen and fresh berries are different rows", () => {
  assert.equal(id("RASPBERRIES IQF CATERERS C 1kg"), "raspberry-iqf")
  assert.equal(id("RASPBERRIES Speedyberry 1kg (10)"), "raspberry-iqf")
  assert.equal(id("Berries - Raspberry"), "raspberry-fresh")
  assert.equal(id("RASPBERRY PNT (125GRM)"), "raspberry-fresh")
  assert.equal(id("Raspberries Whole Freeze Dried (Fresh As)"), null)
  assert.equal(id("STRAWBERRIES IQF CATERERS C 1kg"), "strawberry-iqf")
  assert.equal(id("Berries - Strawberry Extra Large"), "strawberry-large")
  assert.equal(id("BLUEBERRIES IQF CATERERS C 1kg"), "blueberry-iqf")
  assert.equal(id("BLUEBERRY PNT (125G)"), "blueberry-fresh")
})

test("flours keep apart: wholemeal is not plain, cornflour is not gluten free flour", () => {
  assert.equal(id("FLOUR PLAIN WHOLEMEAL ALLIED 12.5kg"), null)
  assert.equal(id("FLOUR PLAIN GEM OF THE 12.5kg"), "flour-plain")
  assert.equal(id("CORNFLOUR MAIZE GLUTEN FREE CATERERS C 5kg"), null)
  assert.equal(id("FLOUR PLAIN GLUTEN FREE BAKING TEC 10kg"), "flour-gluten-free")
  assert.equal(id("FLOUR SELF RAISING GEM OF THE 12.5kg"), "flour-self-raising")
  assert.equal(id("[EUROFLOUR] FLOUR EURO TYPE 55 LAUCKE 12.5KG 11379"), "flour-euro-55")
  assert.equal(id("BAKERS FLOUR MANILDRA 12.5KG BAG"), "bakers-flour")
})

test("the same item from every supplier lands on one row", () => {
  assert.equal(id("GHEE NEW ZEALAND PURE SOUL 10lt"), "ghee")
  assert.equal(id("GHEE Bucket 10KG"), "ghee")
  assert.equal(id("#17 chicken breast no tenderloin"), "chicken-breast")
  assert.equal(id("Chicken - Breast Fillet Medium #17"), "chicken-breast")
  assert.equal(id("Chicken Breast Butterfly"), "chicken-breast")
  assert.equal(id("PASTE VANILLA BEAN ORGANIC QUEEN 320gr"), "vanilla-paste")
  assert.equal(id("Prova Bourbon Vanilla Paste with Seeds 500g"), "vanilla-paste")
  assert.equal(id("SALT SEA FLAKES NATURAL CORNISH 1kg"), "sea-salt-flakes")
  assert.equal(id("[SALTFLAK] MALDON SEA SALT FLAKES 1.4KG"), "sea-salt-flakes")
  assert.equal(id("CUPS COLD PLASTIC 500ML CLEAR BIOCUP BIOPAK 50's"), "cup-clear-16oz")
  assert.equal(id("CUP Clear 16oz 500ml Green Stripe BetaEco RPET x 1000"), "cup-clear-16oz")
})

test("near-miss words do not match", () => {
  assert.equal(id("Micro Herbs - Lemon Balm"), null)
  assert.equal(id("MICRO HERB LOOSE PNT (75GRMS)"), "micro-herbs")
  assert.equal(id("Bridor Croissant Mini 30g"), "croissant-mini")
  assert.equal(id("Bridor Croissant Large 70g"), "croissant")
  assert.equal(id("MILK TADC Barista Almond UHT 1L x 12"), "almond-milk-barista")
  assert.equal(id("ALMONDS RAW KERNELS CATERERS C 1kg"), "almonds-raw")
  assert.equal(id("BUTTER UNSALTED NZ 25KG"), "butter-unsalted")
  assert.equal(id("BUTTER SALTED YARDE FARM 500gr"), "butter-salted")
  assert.equal(id("TOURAGE (FRENCH) BUTTER SHEETS 10x1KG"), "tourage-butter-sheets")
  assert.equal(id("Pancake Mix Buttermilk"), null)
})

// ─── Right supplier, backup, or off the sheet ─────────────────────

test("Philly only: Express from Bidfood is the wrong product, a bare description is not judged", () => {
  const cc = SHEET.find((r) => r.id === "cream-cheese")!
  assert.deepEqual(verdict(cc, "Bidfood", "CHEESE CREAM EXPRESS PROFESSIONAL DAIRY FARM 2kg"), { kind: "off", why: "product", say: "not Philly" })
  assert.equal(verdict(cc, "Bidfood", "CHEESE PHILADELPHIA CREAM philly 2kg").kind, "right")
  assert.equal(verdict(cc, "Bidfood", "CHEESE CREAM 2kg").kind, "right")
  assert.deepEqual(verdict(cc, "The Provedores", "CHEESE CREAM 2kg (6)"), { kind: "off", why: "supplier", say: null })
  const gf = SHEET.find((r) => r.id === "flour-gluten-free")!
  assert.equal(verdict(gf, "Bidfood", "FLOUR PLAIN GLUTEN FREE").kind, "right")
  assert.equal(verdict(gf, "Bidfood", "FLOUR PLAIN GLUTEN FREE WHITE WING 500gr").kind, "off")
})

test("allowed second choices are backups, aliases are the same supplier", () => {
  const v = SHEET.find((r) => r.id === "vanilla-paste")!
  assert.equal(verdict(v, "Eustralis", "Prova Bourbon Vanilla Paste with Seeds 500g").kind, "backup")
  assert.equal(verdict(v, "Bidfood", "PASTE VANILLA BEAN ORGANIC QUEEN 320gr").kind, "off")
  const crab = SHEET.find((r) => r.id === "crab-spanner")!
  assert.equal(verdict(crab, "The Fish Factory", "Spanner Crab Meat Cooked KG").kind, "backup")
  assert.equal(verdict(crab, "Ocean Made Seafood", "Crab Meat QLD Spanner Cooked").kind, "off")
  const sd = SHEET.find((r) => r.id === "sourdough-white")!
  assert.equal(verdict(sd, "Pixel Bakehouse", "WHITE Sourdough 1400g").kind, "right")
})

// ─── Prices ────────────────────────────────────────────────────────

test("price basis: billed per kg, a printed pack, counts, and a cloth-length is not a count", () => {
  assert.deepEqual(priceBasis({ description: "Chicken Breast", unit: "kg", qty: 15, unitPrice: 11, effectivePrice: null }), { per: "kg", price: 11, qty: 15 })
  const ghee = priceBasis({ description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", qty: 2, unitPrice: 162.29, effectivePrice: null })!
  assert.equal(ghee.per, "l")
  assert.ok(Math.abs(ghee.price - 16.229) < 1e-9)
  assert.equal(ghee.qty, 20)
  const cups = priceBasis({ description: "CUP Clear 16oz 500ml Green Stripe BetaEco RPET x 1000", unit: "CTN", qty: 1, unitPrice: 98.65, effectivePrice: null }, null, true)!
  assert.equal(cups.per, "ea")
  assert.ok(Math.abs(cups.price - 0.09865) < 1e-9)
  // "45 cm x 600 m (4)" is a roll size, not 600 of something
  assert.deepEqual(priceBasis({ description: "CLING Wrap 45 cm x 600 m (4)", unit: "INN", qty: 4, unitPrice: 33.92, effectivePrice: null }), { per: "u:inn", price: 33.92, qty: 4 })
  // no pack anywhere: per billed unit
  assert.deepEqual(priceBasis({ description: "Herbs - Watercress Medium", unit: "box", qty: 2, unitPrice: 34.6, effectivePrice: null }), { per: "u:box", price: 34.6, qty: 2 })
  // a learned pack fills a truncated description
  assert.deepEqual(priceBasis({ description: "CREME FRAICHE", unit: "BAG", qty: 4, unitPrice: 11.5, effectivePrice: null }, { qty: 0.5, unit: "kg" }), { per: "kg", price: 23, qty: 2 })
})

test("learnPacks: one printed pack per supplier and unit is borrowed; two sizes are not", () => {
  const packs = learnPacks(
    [
      line({ date: "2026-11-01", supplierName: "Bidfood", description: "CREME FRAICHE TATUA 500gr", unit: "BAG" }),
      line({ date: "2026-11-02", supplierName: "Bidfood", description: "CREME FRAICHE", unit: "BAG" }),
      line({ date: "2026-11-01", supplierName: "Bidfood", description: "SUGAR CASTER BUNDABERG 25kg", unit: "BAG" }),
      line({ date: "2026-11-02", supplierName: "Bidfood", description: "SUGAR CASTER BUNDABERG 15kg", unit: "BAG" }),
    ],
    SHEET
  )
  assert.deepEqual(packs.get("creme-fraiche|Bidfood|bag"), { qty: 0.5, unit: "kg" })
  assert.equal(packs.get("caster-sugar|Bidfood|bag"), undefined)
})

// ─── The week ──────────────────────────────────────────────────────

// Real case 12 to 17 Nov 2026: Bidfood ghee $162.29 a 10 L bucket at
// Burleigh, Provedores $149.50 a 10 kg bucket at Beach House.
test("ghee from Bidfood: off the sheet, litre against kilo, net of the rebate", () => {
  const r = run([
    line({ date: "2026-11-03", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, venue: "BEACH_HOUSE" }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29 }),
    line({ date: "2026-11-14", supplierName: "Bidfood", description: "GHEE NEW ZEALAND", unit: "BKT", unitPrice: 162.29 }),
  ])
  assert.equal(r.offLines, 2)
  assert.equal(r.rows.length, 1)
  const row = r.rows[0]
  assert.equal(row.item, "Ghee")
  assert.equal(row.boughtFrom, "Bidfood")
  assert.equal(row.shouldBe, "The Provedores")
  assert.equal(row.per, "kg")
  assert.equal(row.namedNotFrom, true)
  // 162.29 x 0.96 = 155.80 a bucket vs 149.50: 6.30 a bucket, two buckets
  assert.ok(Math.abs(row.extra! - 2 * (162.29 * 0.96 - 149.5)) < 0.01)
  assert.deepEqual(row.dates, ["2026-11-12", "2026-11-14"])
  assert.equal(r.byVenue.BURLEIGH.lines, 2)
})

test("right supplier lines count as right; backups are listed, not flagged", () => {
  const r = run([
    line({ date: "2026-11-12", supplierName: "Fermex", description: "FLAVORMASTER VANILLA BEAN PASTE 1KG", unit: "EA", unitPrice: 53.5 }),
    line({ date: "2026-11-13", supplierName: "Eustralis", description: "Prova Bourbon Vanilla Paste with Seeds 500g", unit: "EA", unitPrice: 25.9 }),
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "MILK CONDENSED SWEETENED NESTLE 395gr", unit: "CAN", unitPrice: 4.16, qty: 12 }),
    line({ date: "2026-11-13", supplierName: "Coastal Fresh", description: "Some thing not on the sheet", unit: "kg", unitPrice: 4 }),
  ])
  assert.equal(r.sheetLines, 3)
  assert.equal(r.rightLines, 1)
  assert.equal(r.offLines, 0)
  assert.equal(r.backups.length, 2)
  assert.equal(r.rows.length, 0)
})

test("an off-sheet buy can be cheaper: shown negative and totalled apart", () => {
  const r = run([
    line({ date: "2026-11-01", supplierName: "The Provedores", description: "CREAM Thickened 5L (3)", unit: "EA", unitPrice: 37.8 }),
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "CREAM THICKENED BULLA 5lt", unit: "EA", unitPrice: 37.5, qty: 6 }),
  ])
  const row = r.rows[0]
  // 37.5 x 0.96 = 36.00 vs 37.80 a 5 L: 1.80 cheaper x 6
  assert.ok(Math.abs(row.extra! + 6 * 1.8) < 0.01)
  assert.equal(r.extraTotal, 0)
  assert.ok(Math.abs(r.cheaperTotal - 10.8) < 0.01)
})

test("a gap over 2x is a pack misread: no dollar figure", () => {
  const r = run([
    line({ date: "2026-11-01", supplierName: "Son Of A Bunn", description: "Chicken Breast", unit: "kg", unitPrice: 11, qty: 10 }),
    line({ date: "2026-11-13", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 139, qty: 2 }),
  ])
  assert.equal(r.rows[0].extra, null)
  assert.equal(r.offLines, 1)
})

test("the sheet price stands in when the right supplier has no recent invoice", () => {
  const r = run([line({ date: "2026-11-13", supplierName: "Bidfood", description: "FONDANT SOFT WHITE ALLIED 15kg", unit: "EA", unitPrice: 80, qty: 2 })])
  // 80 x 0.96 / 15 = 5.12/kg vs the sheet's 4.55/kg, 30 kg
  assert.ok(Math.abs(r.rows[0].extra! - (5.12 - 4.55) * 30) < 0.01)
})

test("late invoices: earlier weeks count only when they reached us since last Wednesday", () => {
  const r = run([
    line({ date: "2026-11-07", supplierName: "Marrow Meats", description: "Chicken - Breast Fillet Medium #17", unit: "kg", unitPrice: 13.9, receivedAt: new Date("2026-11-20T01:00:00Z") }),
    line({ date: "2026-11-06", supplierName: "Marrow Meats", description: "Chicken - Breast Fillet Medium #17", unit: "kg", unitPrice: 13.9, receivedAt: new Date("2026-11-07T01:00:00Z") }),
    line({ date: "2026-10-10", supplierName: "Marrow Meats", description: "Chicken - Breast Fillet Medium #17", unit: "kg", unitPrice: 13.9, receivedAt: new Date("2026-11-20T01:00:00Z") }),
  ])
  assert.equal(r.offLines, 1)
  assert.equal(r.rows[0].late, true)
  assert.deepEqual(r.rows[0].dates, ["2026-11-07"])
})

test("wrong product rows carry no price, sorted after the dearest", () => {
  const r = run([
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "CHEESE CREAM EXPRESS PROFESSIONAL DAIRY FARM 2kg", unit: "PKT", unitPrice: 19.99, qty: 5 }),
    line({ date: "2026-11-01", supplierName: "Bidfood", description: "CHEESE PHILADELPHIA CREAM philly 2kg", unit: "PKT", unitPrice: 34.63 }),
    line({ date: "2026-11-13", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 12.5, qty: 10 }),
  ])
  assert.equal(r.rows[0].item, "Chicken breast")
  assert.equal(r.rows[1].why, "product")
  assert.equal(r.rows[1].extra, null)
})

// ─── The app ───────────────────────────────────────────────────────

test("formDrift: a wrong supplier switched on, the right one switched off", () => {
  const drift = formDrift([
    { id: "a", supplier: "Bidfood", name: "Salt Sea Flakes Natural (Cornish)", active: true },
    { id: "b", supplier: "Fermex", name: "Maldon Sea Salt Flakes 1.4kg", active: true },
    { id: "c", supplier: "Bidfood", name: "Ghee New Zealand (Puresoul)", active: false },
    { id: "d", supplier: "The Provedores", name: "Ghee Bucket 10kg (Pure Soul)", active: true },
    { id: "e", supplier: "Bidfood", name: "Blueberries Iqf (Catchoice)", active: false },
    { id: "f", supplier: "Bidfood", name: "Something else on the form", active: true },
    { id: "g", supplier: "Eustralis", name: "Vanilla Paste Bourbon with Seeds 500g (Prova)", active: true },
    { id: "h", supplier: "Gold Coast Premium Foods", name: "Haloumi Cheese", active: false },
  ])
  assert.deepEqual(
    drift.map((x) => [x.formId, x.problem]),
    [
      ["a", "wrong-supplier-active"],
      ["e", "right-supplier-off"],
    ]
  )
})

// ─── The sheet and the email ───────────────────────────────────────

test("sheet: unique ids, every department present, page rows carry no regexes", () => {
  assert.equal(new Set(SHEET.map((r) => r.id)).size, SHEET.length)
  for (const dept of DEPTS) assert.ok(SHEET.some((r) => r.dept === dept), dept)
  const rows = sheetRows()
  assert.equal(rows.length, SHEET.length)
  assert.doesNotThrow(() => JSON.stringify(rows))
  assert.ok(!JSON.stringify(rows).includes("{}"))
})

test("email: headline subject, no em dashes, venues by name", () => {
  const r = run([
    line({ date: "2026-11-03", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5 }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29 }),
  ])
  const e = renderWhereToOrderEmail({ result: r, drift: [] })
  assert.equal(e.subject, "Where to order, week to Tue 17 Nov: 1 item from the wrong supplier, $6 extra")
  assert.ok(!e.html.includes("—") && !e.text.includes("—"))
  assert.ok(e.text.includes("Ghee: Bidfood, not The Provedores"))
  assert.ok(e.text.includes("Burleigh"))
  assert.ok(e.text.includes("The app's order forms match the sheet."))

  const clean = renderWhereToOrderEmail({ result: run([line({ date: "2026-11-12", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5 })]), drift: [] })
  assert.equal(clean.subject, "Where to order, week to Tue 17 Nov: all from the right supplier")
})

test("one venue (Chloe, 25 Nov 2026): judges only that venue's lines, prices from both", () => {
  const lines = [
    // The right supplier's price comes from Currumbin's invoice.
    line({ date: "2026-11-03", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, venue: "BEACH_HOUSE" }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29, venue: "BURLEIGH" }),
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29, venue: "BEACH_HOUSE" }),
    line({ date: "2026-11-14", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, venue: "BEACH_HOUSE" }),
  ]
  const one = (venue: string) => auditWeek({ lines, weekStart: WEEK_START, weekEnd: WEEK_END, lateSince: LATE_SINCE, venue })
  const b = one("BURLEIGH")
  assert.equal(b.sheetLines, 1)
  assert.equal(b.offLines, 1)
  assert.deepEqual(b.rows.map((x) => x.venue), ["BURLEIGH"])
  assert.equal(Math.round(b.extraTotal), 6)
  const c = one("BEACH_HOUSE")
  assert.equal(c.sheetLines, 2)
  assert.equal(c.rightLines, 1)
  assert.deepEqual(c.rows.map((x) => x.venue), ["BEACH_HOUSE"])
  // Both venues together still add up to the whole.
  const all = run(lines)
  assert.equal(all.offLines, b.offLines + c.offLines)
  assert.equal(all.sheetLines, b.sheetLines + c.sheetLines)

  const eb = renderWhereToOrderEmail({ result: b, drift: [], venue: "BURLEIGH" })
  assert.equal(eb.subject, "Burleigh: where to order, week to Tue 17 Nov: 1 item from the wrong supplier, $6 extra")
  assert.ok(!eb.text.includes("Currumbin") && !eb.text.includes("Beach House"))
  assert.ok(eb.text.includes("1 of 1 Burleigh invoice lines"))
  assert.ok(!eb.html.includes("—") && !eb.text.includes("—"))
  const ec = renderWhereToOrderEmail({ result: c, drift: [], venue: "BEACH_HOUSE" })
  assert.ok(ec.subject.startsWith("Currumbin: where to order, week to Tue 17 Nov: 1 item"))
  assert.ok(!ec.text.includes("Burleigh"))
  const none = renderWhereToOrderEmail({ result: one("TEA_GARDEN"), drift: [], venue: "TEA_GARDEN" })
  assert.equal(none.subject, "Tea Garden: where to order, week to Tue 17 Nov: all from the right supplier")
  assert.ok(none.text.includes("No Tea Garden invoice lines"))
})

test("one venue: no-venue and late invoices still land in exactly one venue's email", () => {
  const ghee = (p: Partial<AuditLine> & { date: string }) =>
    line({ supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29, ...p })
  const lines: AuditLine[] = [
    // The right price comes from a Tea Garden invoice, a venue with no email of its own.
    line({ date: "2026-11-12", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, venue: "TEA_GARDEN" }),
    ghee({ date: "2026-11-13", venue: "BURLEIGH" }),
    { ...ghee({ date: "2026-11-14" }), venue: null },
    // Dated the week before, reached us after last Wednesday's run.
    ghee({ date: "2026-11-05", venue: "BEACH_HOUSE", receivedAt: new Date("2026-11-20T01:00:00Z") }),
    // Outside the week and not late: in no email.
    ghee({ date: "2026-11-05", venue: "BURLEIGH", receivedAt: new Date("2026-11-06T01:00:00Z") }),
  ]
  const all = run(lines)
  assert.equal(all.offLines, 3)
  const names = ["BURLEIGH", "BEACH_HOUSE", ...Object.keys(all.byVenue).filter((v) => v !== "BURLEIGH" && v !== "BEACH_HOUSE")]
  assert.deepEqual(names, ["BURLEIGH", "BEACH_HOUSE", "Unknown"])
  const each = names.map((venue) => auditWeek({ lines, weekStart: WEEK_START, weekEnd: WEEK_END, lateSince: LATE_SINCE, venue }))
  assert.deepEqual(each.map((r) => r.offLines), [1, 1, 1])
  assert.equal(each.reduce((s, r) => s + r.offLines, 0), all.offLines)
  assert.equal(each.reduce((s, r) => s + r.rows.length, 0), all.rows.length)
  assert.equal(Math.round(each.reduce((s, r) => s + r.extraTotal, 0) * 100), Math.round(all.extraTotal * 100))
  // Every venue priced against the Tea Garden invoice.
  for (const r of each) assert.ok(r.extraTotal > 6 && r.extraTotal < 7, `extra ${r.extraTotal}`)
  assert.equal(each[1].rows[0].late, true)
  assert.equal(each[2].rows[0].venue, "Unknown")
  // Tea Garden's right buy is in the whole but in no venue email (only right buys there).
  assert.equal(all.sheetLines, each.reduce((s, r) => s + r.sheetLines, 0) + 1)
  const unknown = renderWhereToOrderEmail({ result: each[2], drift: [], venue: "Unknown" })
  assert.ok(unknown.subject.startsWith("Venue not on invoice: where to order"))
  assert.ok(!unknown.text.includes("—"))
})
