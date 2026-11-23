/**
 * The money side of the Wednesday where-to-order check (./audit.ts):
 * rebate netting, the 2x guard, borrowed pack sizes, the late-invoice and
 * reference windows, rows that mix priced and unpriced lines, the "Philly
 * only" path, and the Wed to Tue AEST trading week. Pure, no database.
 */
import { test } from "node:test"
import assert from "node:assert/strict"
import { auditWeek, formDrift, LATE_LOOKBACK_DAYS, REF_WINDOW_DAYS, type AuditLine } from "./audit"
import { SHEET } from "./sheet"
import { renderWhereToOrderEmail } from "./email"
import { lastCompletedTarteWeek } from "@/lib/dates"
import { parsePackSize } from "@/lib/invoices/units"
import { rebateFor } from "@/lib/preferred-supplier"

const DAY = 86_400_000
// The week the Wed 18 Nov 2026 14:00 AEST run checks: Wed 11 to Tue 17 Nov.
const RUN_AT = new Date("2026-11-18T04:00:00Z")
const WEEK = lastCompletedTarteWeek(RUN_AT)
// audit-service: the previous Wednesday run, a week before.
const LATE_SINCE = new Date(RUN_AT.getTime() - 7 * DAY)

function line(p: Partial<AuditLine> & { date: string; supplierName: string; description: string }): AuditLine {
  const qty = p.qty ?? 1
  const unitPrice = p.unitPrice ?? 10
  return {
    supplierName: p.supplierName,
    description: p.description,
    unit: p.unit ?? "EA",
    venue: p.venue === undefined ? "BURLEIGH" : p.venue,
    invoiceDate: new Date(`${p.date}T00:00:00Z`),
    receivedAt: p.receivedAt ?? new Date(`${p.date}T06:00:00Z`),
    qty,
    lineTotal: p.lineTotal ?? unitPrice * qty,
    unitPrice,
    effectivePrice: p.effectivePrice ?? null,
  }
}

const run = (lines: AuditLine[], lateSince = LATE_SINCE) => auditWeek({ lines, weekStart: WEEK.start, weekEnd: WEEK.end, lateSince })

function near(actual: number | null | undefined, expected: number, eps = 0.005, msg?: string) {
  assert.ok(actual != null && Math.abs(actual - expected) <= eps, `${msg ?? ""} expected ${expected}, got ${actual}`)
}

// ─── The week itself ───────────────────────────────────────────────

test("the Wednesday run checks Wed 11 to Tue 17 Nov (AEST), not a Monday week", () => {
  assert.equal(WEEK.startKey, "2026-11-11")
  assert.equal(WEEK.endKey, "2026-11-17")
  assert.equal(WEEK.start.getUTCDay(), 3)
  // Just before midnight Tue AEST (13:59 UTC) the week to Tue 17 Nov is not closed yet.
  assert.equal(lastCompletedTarteWeek(new Date("2026-11-17T13:59:00Z")).endKey, "2026-11-10")
  // Half an hour into Wed AEST (Tue 14:30 UTC) it is.
  assert.equal(lastCompletedTarteWeek(new Date("2026-11-17T14:30:00Z")).endKey, "2026-11-17")
})

test("week edges: the Wednesday it opens and the Tuesday it closes are in, the next Wednesday and a Monday-week start are not", () => {
  const chicken = (date: string) => line({ date, supplierName: "Marrow Meats", description: "Chicken - Breast Fillet Medium #17", unit: "kg", unitPrice: 12.5, qty: 4 })
  const r = run([
    chicken("2026-11-10"), // Tue before: last week's email (received before last Wednesday's run)
    chicken("2026-11-11"), // Wed: first day
    chicken("2026-11-16"), // Mon: mid week, would wrongly open a Monday week
    chicken("2026-11-17"), // Tue: last day
    chicken("2026-11-18"), // Wed after: next week
  ])
  assert.equal(r.weekStartKey, "2026-11-11")
  assert.equal(r.weekEndKey, "2026-11-17")
  assert.equal(r.offLines, 3)
  assert.equal(r.rows.length, 1)
  assert.deepEqual(r.rows[0].dates, ["2026-11-11", "2026-11-16", "2026-11-17"])
  assert.equal(r.rows[0].late, false)
  const e = renderWhereToOrderEmail({ result: r, drift: [] })
  assert.ok(e.subject.startsWith("Where to order, week to Tue 17 Nov:"), e.subject)
  assert.match(e.text, /Wed,? 11 Nov to Tue,? 17 Nov/)
})

// ─── Late invoices ─────────────────────────────────────────────────

test("late window: 21 days back to the day, received at or after last Wednesday's run", () => {
  assert.equal(LATE_LOOKBACK_DAYS, 21)
  const chicken = (date: string, receivedAt: Date) =>
    line({ date, supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 12.5, qty: 2, receivedAt })
  const r = run([
    chicken("2026-10-21", new Date("2026-11-12T01:00:00Z")), // exactly 21 days before Wed 11 Nov: late, counted
    chicken("2026-10-20", new Date("2026-11-12T01:00:00Z")), // 22 days: too old
    chicken("2026-11-10", LATE_SINCE), // reached us the instant last week's run did: late, counted
    chicken("2026-11-10", new Date(LATE_SINCE.getTime() - 1)), // a millisecond earlier: last week's email had it
    chicken("2026-11-11", new Date("2026-11-11T03:59:00Z")), // in the week: counted whenever it came in, never late
  ])
  assert.equal(r.offLines, 3)
  assert.equal(r.sheetLines, 3)
  const late = r.rows.find((x) => x.late)!
  const onTime = r.rows.find((x) => !x.late)!
  assert.equal(r.rows.length, 2, "late and on-time buys are separate rows")
  assert.deepEqual(late.dates, ["2026-10-21", "2026-11-10"])
  assert.equal(late.lines, 2)
  assert.deepEqual(onTime.dates, ["2026-11-11"])
  near(late.spend, 50)
  near(onTime.spend, 25)
  assert.ok(renderWhereToOrderEmail({ result: r, drift: [] }).text.includes("(late invoice)"))
})

test("a late line is priced against the same 8-week reference as the week", () => {
  const r = run([
    line({ date: "2026-10-28", supplierName: "Son Of A Bunn", description: "Chicken Breast", unit: "kg", unitPrice: 11, qty: 10 }),
    line({ date: "2026-11-05", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 12.5, qty: 8, receivedAt: new Date("2026-11-13T00:00:00Z") }),
  ])
  assert.equal(r.rows.length, 1)
  assert.equal(r.rows[0].late, true)
  near(r.rows[0].extra, 12) // (12.50 - 11.00) x 8 kg
})

// ─── Reference prices ──────────────────────────────────────────────

test("reference window: 56 days back from Tuesday night, and nothing after the week", () => {
  assert.equal(REF_WINDOW_DAYS, 56)
  const bidfood = line({ date: "2026-11-13", supplierName: "Bidfood", description: "FONDANT SOFT WHITE ALLIED 15kg", unit: "EA", unitPrice: 80 })
  const fermex = (date: string, unitPrice: number) => line({ date, supplierName: "Fermex", description: "FONDANT SOFT WHITE BAKELS 15kg", unit: "EA", unitPrice })
  // Bidfood 80 x 0.96 / 15 = 5.12/kg net, 15 kg.
  // Fermex on Wed 23 Sep is inside the 56 days: $60 a bag = 4.00/kg.
  near(run([fermex("2026-09-23", 60), bidfood]).rows[0].extra, (5.12 - 4) * 15)
  // Tue 22 Sep is one day too old: the sheet's 4.55/kg stands in.
  const old = run([fermex("2026-09-22", 60), bidfood]).rows[0]
  near(old.extra, (5.12 - 4.55) * 15)
  near(old.rightPer, 4.55)
  // A Fermex invoice dated the Wednesday after the week does not set this week's price.
  near(run([fermex("2026-11-18", 30), bidfood]).rows[0].extra, (5.12 - 4.55) * 15)
})

test("reference is the median of the right supplier's lines, not the last or the mean", () => {
  const sob = (date: string, unitPrice: number) => line({ date, supplierName: "Son Of A Bunn", description: "Chicken Breast", unit: "kg", unitPrice, qty: 10 })
  const r = run([
    sob("2026-10-14", 11),
    sob("2026-10-21", 11.5),
    sob("2026-10-28", 30), // a misread line should not drag the reference
    line({ date: "2026-11-12", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 13.9, qty: 10 }),
  ])
  near(r.rows[0].rightPer, 11.5)
  near(r.rows[0].extra, (13.9 - 11.5) * 10)
})

test("credits, zero quantities and zero prices are ignored, on both sides", () => {
  const r = run([
    line({ date: "2026-11-03", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5 }),
    // A Provedores credit must not become a reference price.
    line({ date: "2026-11-04", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, qty: -1, lineTotal: -149.5 }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29 }),
    // Bidfood credit for that bucket, a zero-qty line and a $0 line: not buys.
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29, qty: -1, lineTotal: -162.29 }),
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29, qty: 0, lineTotal: 0 }),
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 0, lineTotal: 0 }),
  ])
  assert.equal(r.offLines, 1)
  assert.equal(r.sheetLines, 1)
  near(r.rows[0].spend, 162.29)
  near(r.rows[0].rightPer, 14.95)
})

// ─── Rebate netting ────────────────────────────────────────────────

test("rebate: a Bidfood off-sheet buy is netted 4% before it is compared", () => {
  const r = run([
    line({ date: "2026-11-02", supplierName: "Fermex", description: "FLAVORMASTER VANILLA BEAN PASTE 1KG", unit: "EA", unitPrice: 53.5 }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "PASTE VANILLA BEAN ORGANIC QUEEN 320gr", unit: "EA", unitPrice: 30, qty: 3 }),
  ])
  const row = r.rows[0]
  assert.equal(row.boughtFrom, "Bidfood")
  assert.equal(row.per, "kg")
  // $30 / 0.32 kg = 93.75/kg gross, 90.00 net, vs Fermex 53.50; 0.96 kg bought
  near(row.paidPer, 90)
  near(row.rightPer, 53.5)
  near(row.extra, (90 - 53.5) * 0.96)
  near(r.extraTotal, 35.04)
  near(r.byVenue.BURLEIGH.extra, 35.04)
})

test("rebate: when Bidfood is the right supplier, its invoices are netted 4% as the reference", () => {
  const r = run([
    line({ date: "2026-11-02", supplierName: "Bidfood", description: "MAYONNAISE KEWPIE 1kg", unit: "EA", unitPrice: 11.6 }),
    line({ date: "2026-11-13", supplierName: "The Provedores", description: "MAYONNAISE KEWPIE 1kg", unit: "EA", unitPrice: 13.6, qty: 6 }),
  ])
  const row = r.rows[0]
  assert.equal(row.shouldBe, "Bidfood")
  assert.equal(row.namedNotFrom, true)
  near(row.rightPer, 11.136) // 11.60 x 0.96
  near(row.paidPer, 13.6) // Provedores: no rebate
  near(row.extra, (13.6 - 11.136) * 6)
})

test("rebate: the sheet's Bidfood per-kg price is already net, so the fallback is not netted twice", () => {
  // No Bidfood Kewpie invoice in 8 weeks: the sheet's $11.14/kg (11.60 x 0.96) stands in.
  const r = run([line({ date: "2026-11-13", supplierName: "The Provedores", description: "MAYONNAISE KEWPIE 1kg", unit: "EA", unitPrice: 13.6, qty: 6 })])
  const row = r.rows[0]
  near(row.rightPer, 11.14)
  near(row.extra, (13.6 - 11.14) * 6)
})

test("sheet data: every rebate supplier's per-unit price is the pack price net of the rebate", () => {
  for (const rule of SHEET) {
    const rebate = rebateFor(rule.orderFrom)
    if (!rebate || !rule.per) continue
    const pack = parsePackSize(rule.product)
    if (!pack || pack.unit !== rule.per.unit) continue
    const netPer = (rule.price * (1 - rebate / 100)) / pack.qty
    assert.ok(Math.abs(rule.per.price - netPer) <= 0.006, `${rule.id}: sheet ${rule.per.price}/${rule.per.unit}, net of ${rebate}% is ${netPer.toFixed(3)}`)
  }
})

// ─── The 2x guard ──────────────────────────────────────────────────

test("2x guard: exactly double or exactly half is priced, a cent past either is not", () => {
  const ref = line({ date: "2026-11-02", supplierName: "Son Of A Bunn", description: "Chicken Breast", unit: "kg", unitPrice: 11, qty: 10 })
  const marrow = (unitPrice: number) => line({ date: "2026-11-12", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice, qty: 1 })
  near(run([ref, marrow(22)]).rows[0].extra, 11)
  assert.equal(run([ref, marrow(22.01)]).rows[0].extra, null)
  near(run([ref, marrow(5.5)]).rows[0].extra, -5.5)
  assert.equal(run([ref, marrow(5.49)]).rows[0].extra, null)
  // An unpriced row carries no per-unit figures for the email to print.
  const unpriced = run([ref, marrow(22.01)]).rows[0]
  assert.equal(unpriced.paidPer, null)
  assert.equal(unpriced.rightPer, null)
  assert.equal(unpriced.per, null)
  near(unpriced.spend, 22.01)
})

test("2x guard is applied to the net price: Bidfood at 2.04x gross is 1.96x net, so it is priced", () => {
  const r = run([
    line({ date: "2026-11-02", supplierName: "Fermex", description: "PISTACHIO KERNELS 3KG", unit: "EA", unitPrice: 165 }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "PISTACHIO KERNELS 1kg", unit: "EA", unitPrice: 112 }),
  ])
  // 112 / 55 = 2.036 gross; 107.52 / 55 = 1.955 net
  near(r.rows[0].extra, 107.52 - 55)
})

// ─── Pack sizes ────────────────────────────────────────────────────

const casterRef = line({ date: "2026-11-02", supplierName: "Bidfood", description: "SUGAR CASTER BUNDABERG 25kg", unit: "BAG", unitPrice: 40.9 })
const CASTER_REF = (40.9 * 0.96) / 25 // 1.57056/kg

test("pack learning: one size printed by that supplier fills a bare line", () => {
  const r = run([
    casterRef,
    line({ date: "2026-10-20", supplierName: "Fermex", description: "SUGAR CASTER 25kg", unit: "BAG", unitPrice: 47 }),
    line({ date: "2026-11-12", supplierName: "Fermex", description: "SUGAR CASTER", unit: "BAG", unitPrice: 47, qty: 2 }),
  ])
  assert.equal(r.offLines, 1, "the October Fermex line only teaches the pack, it is not in the week")
  const row = r.rows[0]
  assert.equal(row.per, "kg")
  near(row.paidPer, 47 / 25)
  near(row.extra, (47 / 25 - CASTER_REF) * 50)
})

test("pack learning: two sizes from the same supplier on the same billed unit leave a bare line unpriced", () => {
  const r = run([
    casterRef,
    line({ date: "2026-10-20", supplierName: "Fermex", description: "SUGAR CASTER 25kg", unit: "BAG", unitPrice: 47 }),
    line({ date: "2026-10-27", supplierName: "Fermex", description: "SUGAR CASTER 15kg", unit: "BAG", unitPrice: 30 }),
    line({ date: "2026-11-12", supplierName: "Fermex", description: "SUGAR CASTER", unit: "BAG", unitPrice: 47, qty: 2 }),
  ])
  assert.equal(r.rows[0].extra, null)
  assert.equal(r.rows[0].per, null)
  near(r.offSpend, 94)
  assert.equal(r.extraTotal, 0)
  assert.ok(renderWhereToOrderEmail({ result: r, drift: [] }).text.includes("price not comparable"))
})

test("pack learning: a pack is not borrowed across billed units or from another supplier", () => {
  // Fermex prints 25kg per BAG; its bare line billed EA borrows nothing.
  const otherUnit = run([
    casterRef,
    line({ date: "2026-10-20", supplierName: "Fermex", description: "SUGAR CASTER 25kg", unit: "BAG", unitPrice: 47 }),
    line({ date: "2026-11-12", supplierName: "Fermex", description: "SUGAR CASTER", unit: "EA", unitPrice: 47 }),
  ])
  assert.equal(otherUnit.rows[0].extra, null)
  // Only Bidfood prints 25kg; a bare Fermex line does not borrow Bidfood's pack.
  const otherSupplier = run([casterRef, line({ date: "2026-11-12", supplierName: "Fermex", description: "SUGAR CASTER", unit: "BAG", unitPrice: 47 })])
  assert.equal(otherSupplier.rows[0].extra, null)
})

test("produce with no pack: per box against per box, at the price actually paid after a line discount", () => {
  const r = run([
    line({ date: "2026-11-02", supplierName: "Jensens", description: "Cucumbers - Continental", unit: "box", unitPrice: 24.85 }),
    // Coastal Fresh printed $30 a box but the line came to $54 for 2: $27 paid
    line({ date: "2026-11-12", supplierName: "Coastal Fresh", description: "CUCUMBER CONTINENTAL LARGE", unit: "box", unitPrice: 30, qty: 2, lineTotal: 54, effectivePrice: 27 }),
    // the same buy billed per kg has no per-kg Jensens price and no sheet per-kg price
    line({ date: "2026-11-13", supplierName: "Coastal Fresh", description: "CUCUMBER CONTINENTAL LARGE", unit: "kg", unitPrice: 4.2, qty: 5 }),
  ])
  const row = r.rows[0]
  assert.equal(row.lines, 2)
  assert.equal(row.per, "u:box")
  near(row.paidPer, 27)
  near(row.extra, (27 - 24.85) * 2)
  near(row.spend, 54 + 21)
  assert.ok(renderWhereToOrderEmail({ result: r, drift: [] }).html.includes("$27.00/box"))
})

// ─── Rows mixing priced and unpriced lines ─────────────────────────

test("a row with priced and unpriced lines: spend counts all, extra and per-kg only the priced one", () => {
  const r = run([
    line({ date: "2026-11-03", supplierName: "The Provedores", description: "GHEE Bucket 10KG", unit: "TUB", unitPrice: 149.5, venue: "BEACH_HOUSE" }),
    // first in the row and unpriceable: billed EA, no pack, nothing learned for EA
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "GHEE NZ", unit: "EA", unitPrice: 150 }),
    // a 10x extraction error: over the 2x guard
    line({ date: "2026-11-13", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 1622.9 }),
    // the one we can price
    line({ date: "2026-11-14", supplierName: "Bidfood", description: "GHEE NEW ZEALAND PURE SOUL 10lt", unit: "BKT", unitPrice: 162.29 }),
  ])
  assert.equal(r.rows.length, 1)
  const row = r.rows[0]
  assert.equal(row.lines, 3)
  near(row.spend, 150 + 1622.9 + 162.29)
  assert.equal(row.per, "kg")
  near(row.paidPer, 16.229 * 0.96)
  near(row.rightPer, 14.95)
  near(row.extra, (16.229 * 0.96 - 14.95) * 10)
  near(r.extraTotal, 6.3)
  assert.deepEqual(row.dates, ["2026-11-12", "2026-11-13", "2026-11-14"])
})

test("totals: cheaper rows are not netted off the extra, venues add only what cost us, a missing venue is named", () => {
  const r = run([
    line({ date: "2026-11-02", supplierName: "Son Of A Bunn", description: "Chicken Breast", unit: "kg", unitPrice: 11, qty: 10 }),
    line({ date: "2026-11-12", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 13, qty: 10 }),
    line({ date: "2026-11-12", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 10, qty: 10, venue: "BEACH_HOUSE" }),
    line({ date: "2026-11-13", supplierName: "Marrow Meats", description: "#17 chicken breast no tenderloin", unit: "kg", unitPrice: 12, qty: 5, venue: null }),
  ])
  near(r.extraTotal, 20 + 5)
  near(r.cheaperTotal, 10)
  near(r.byVenue.BURLEIGH.extra, 20)
  near(r.byVenue.BEACH_HOUSE.extra, 0)
  assert.equal(r.byVenue.BEACH_HOUSE.lines, 1)
  near(r.byVenue.Unknown.extra, 5)
  assert.deepEqual(r.rows.map((x) => x.venue), ["BURLEIGH", "Unknown", "BEACH_HOUSE"])
  assert.ok(renderWhereToOrderEmail({ result: r, drift: [] }).text.includes("Venue not on invoice"))
})

// ─── Philly only ───────────────────────────────────────────────────

test("only Philly: Express is the wrong product, never priced, and never sets the cream cheese reference", () => {
  const r = run([
    line({ date: "2026-11-02", supplierName: "Bidfood", description: "CHEESE CREAM PHILADELPHIA BLOCK 2kg", unit: "PKT", unitPrice: 34.63 }),
    line({ date: "2026-11-03", supplierName: "Bidfood", description: "CHEESE CREAM EXPRESS PROFESSIONAL DAIRY FARM 2kg", unit: "PKT", unitPrice: 19.99 }),
    line({ date: "2026-11-12", supplierName: "Bidfood", description: "CHEESE CREAM EXPRESS PROFESSIONAL DAIRY FARM 2kg", unit: "PKT", unitPrice: 19.99, qty: 4 }),
    line({ date: "2026-11-13", supplierName: "The Provedores", description: "CHEESE CREAM 2kg (6)", unit: "EA", unitPrice: 36, qty: 2 }),
  ])
  assert.equal(r.offLines, 2)
  assert.equal(r.itemsBought, 1)
  assert.equal(r.itemsOff, 1)
  const express = r.rows.find((x) => x.why === "product")!
  assert.equal(express.boughtFrom, "Bidfood")
  assert.equal(express.say, "not Philly")
  assert.equal(express.extra, null)
  assert.equal(express.lines, 1)
  near(express.spend, 79.96)
  const prov = r.rows.find((x) => x.why === "supplier")!
  // Philly only: 34.63 x 0.96 / 2 = 16.6224/kg (Express in the median would make it 13.10)
  near(prov.rightPer, 16.6224)
  near(prov.extra, (18 - 16.6224) * 4)
  assert.equal(r.rows[0], prov, "the priced row sorts first")
})

test("only Philly on the order forms: an Express line switched on is flagged as the wrong product", () => {
  const drift = formDrift([
    { id: "x", supplier: "Bidfood", name: "Cream Cheese Express Dairy Farm 2kg", active: true },
    { id: "p", supplier: "Bidfood", name: "Cream Cheese Philadelphia Block 2kg", active: true },
  ])
  assert.deepEqual(drift.map((d) => [d.formId, d.problem]), [["x", "wrong-product-active"]])
})
