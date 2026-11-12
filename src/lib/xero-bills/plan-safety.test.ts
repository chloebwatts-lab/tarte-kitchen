import { test } from "node:test"
import assert from "node:assert/strict"
import { dateSuspect, gstKindOf, planDrafts, taxKind, type BillOrg, type KitchenInvoice, type OrgRead, type XeroBill } from "./plan"

// Safety invariants of the Kitchen to Xero DRAFT bills planner (pre-push
// test guard, 12 Nov 2026). Made-up suppliers and figures only: the repo is
// public.

const BUTTER = { ContactID: "b-butter", Name: "Coastline Butter Co" }
const BUTTER_K = { ContactID: "k-butter", Name: "Coastline Butter Co" }
const ONLY_K = { ContactID: "k-herb", Name: "Hinterland Herbs" }

const hist = (contact: { ContactID: string; Name: string }, n: string, date: string, total: number, lines: XeroBill["LineItems"], status = "PAID"): XeroBill => ({
  InvoiceID: `x-${contact.ContactID}-${n}`,
  Type: "ACCPAY",
  Status: status,
  InvoiceNumber: n,
  Contact: contact,
  Date: date,
  DueDate: date,
  Total: total,
  LineItems: lines,
})

function orgs(): Record<BillOrg, OrgRead> {
  return {
    "Tarte Bakery": {
      contacts: [BUTTER],
      bills: [
        hist(BUTTER, "H1", "2026-10-01", 1.11, [{ AccountCode: "510", TaxType: "INPUT", LineAmount: 400 }]),
        hist(BUTTER, "H2", "2026-10-08", 2.22, [{ AccountCode: "511", TaxType: "EXEMPTEXPENSES", LineAmount: 300 }]),
      ],
    },
    "Tarte Currumbin": {
      contacts: [BUTTER_K, ONLY_K],
      bills: [
        hist(BUTTER_K, "H3", "2026-10-02", 3.33, [{ AccountCode: "610", TaxType: "INPUT", LineAmount: 400 }, { AccountCode: "611", TaxType: "EXEMPTEXPENSES", LineAmount: 300 }]),
        hist(ONLY_K, "H4", "2026-10-02", 4.44, [{ AccountCode: "620", TaxType: "INPUT", LineAmount: 40 }]),
      ],
    },
  }
}

const inv = (p: Partial<KitchenInvoice>): KitchenInvoice => ({
  id: "i1",
  supplierName: "Coastline Butter Co",
  venue: "BURLEIGH",
  invoiceNumber: "CB-77001",
  invoiceDate: "2026-11-10",
  dueDate: null,
  subtotal: 269,
  gst: 26.9,
  total: 295.9,
  status: "EXTRACTED",
  hasPdf: true,
  ...p,
})

const OPTS = { cutoff: "2026-11-04", kitchenBaseUrl: "https://kitchen.example.test", splitMixed: true }
const cents = (n: number) => Math.round(n * 100)
const YMD = /^\d{4}-\d{2}-\d{2}$/
const BILL_KEYS = new Set(["Type", "Status", "Contact", "Date", "DueDate", "InvoiceNumber", "Reference", "Url", "LineAmountTypes", "LineItems"])
const LINE_KEYS = new Set(["Description", "Quantity", "UnitAmount", "AccountCode", "TaxType", "TaxAmount", "Tracking"])

/** Deterministic PRNG so a failure reproduces. */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test("every draft over 2,000 random invoices is a DRAFT ACCPAY on a contact id only, ties to the cent, and carries 10% or nil GST per line", () => {
  const rand = rng(20261112)
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
  const invoices: KitchenInvoice[] = []
  const mode = new Map<string, string>()
  for (let i = 0; i < 2000; i++) {
    const sub = int(100, 900000) // cents
    const kind = ["ten", "nil", "mixed", "fee", "over", "bad-sum"][int(0, 5)]
    let gst = 0
    let total = sub
    if (kind === "ten") gst = Math.round(sub / 10) + int(-2, 2)
    if (kind === "mixed") gst = Math.round(int(100, sub - 100 > 100 ? sub - 100 : 100) / 10)
    if (kind === "over") gst = Math.round(sub / 10) + int(5, 5000)
    if (kind === "fee") {
      const fee = int(50, 3000)
      gst = Math.round(fee / 10)
      total = sub + fee + gst
    } else total = sub + gst
    if (kind === "bad-sum") total += int(1, 999)
    const venue = i % 2 ? "BURLEIGH" : "BEACH_HOUSE"
    const id = `r${i}`
    mode.set(id, kind)
    invoices.push(
      inv({
        id,
        venue,
        invoiceNumber: `CB-${100000 + i}`,
        invoiceDate: `2026-11-${String(4 + (i % 8)).padStart(2, "0")}`,
        subtotal: sub / 100,
        gst: gst / 100,
        total: total / 100,
      })
    )
  }
  const r = planDrafts(invoices, orgs(), OPTS)

  // Nothing is lost: each invoice is drafted, held or skipped, once.
  const seen = [...r.drafts.map((d) => d.invoiceId), ...r.holds.map((h) => h.invoiceId), ...r.skipped.map((s) => s.invoiceId)]
  assert.equal(seen.length, invoices.length)
  assert.equal(new Set(seen).size, invoices.length)
  assert.ok(r.drafts.length > 600, `only ${r.drafts.length} drafted`)
  // Both two-line kinds (mixed GST, a taxable fee outside the subtotal) are exercised.
  assert.ok(r.drafts.filter((d) => d.split && mode.get(d.invoiceId) === "mixed").length > 100)
  assert.ok(r.drafts.filter((d) => d.split && mode.get(d.invoiceId) === "fee").length > 100)

  const byId = new Map(invoices.map((x) => [x.id, x]))
  for (const d of r.drafts) {
    const src = byId.get(d.invoiceId)!
    const p = d.payload
    assert.equal(p.Type, "ACCPAY")
    assert.equal(p.Status, "DRAFT")
    assert.equal(p.LineAmountTypes, "Exclusive")
    // Never a new contact: the contact is an id from the org's list, nothing else.
    assert.deepEqual(Object.keys(p.Contact), ["ContactID"])
    assert.ok(orgs()[d.org].contacts.some((c) => c.ContactID === p.Contact.ContactID))
    // Venue to org, never crossed.
    assert.equal(d.org, src.venue === "BURLEIGH" ? "Tarte Bakery" : "Tarte Currumbin")
    for (const k of Object.keys(p)) assert.ok(BILL_KEYS.has(k), `bill field ${k}`)
    assert.ok(p.LineItems.length >= 1 && p.LineItems.length <= 2)
    assert.equal(p.Date, src.invoiceDate)
    assert.match(p.DueDate, YMD)
    assert.ok(p.DueDate >= p.Date)
    let sum = 0
    for (const l of p.LineItems) {
      for (const k of Object.keys(l)) assert.ok(LINE_KEYS.has(k), `line field ${k}`)
      assert.equal(l.Quantity, 1)
      assert.ok(l.UnitAmount > 0)
      assert.equal(cents(l.UnitAmount) / 100, l.UnitAmount, "whole cents")
      assert.equal(cents(l.TaxAmount) / 100, l.TaxAmount, "whole cents")
      const k = taxKind(l.TaxType)
      assert.ok(k, `known tax type ${l.TaxType}`)
      if (k === "nil") assert.equal(l.TaxAmount, 0)
      else assert.ok(Math.abs(cents(l.TaxAmount) * 10 - cents(l.UnitAmount)) <= 21, `GST ${l.TaxAmount} on ${l.UnitAmount}`)
      sum += cents(l.UnitAmount) + cents(l.TaxAmount)
    }
    assert.equal(sum, cents(src.total!), `${d.invoiceId} ties to the cent`)
    const m = mode.get(d.invoiceId)
    assert.ok(m !== "over" && m !== "bad-sum", `${d.invoiceId} (${m}) must be held, was drafted`)
  }
  // GST over 10% and figures that do not add up are always held.
  for (const h of r.holds) {
    const m = mode.get(h.invoiceId)
    if (m === "over") assert.match(h.reason, /GST does not reconcile/)
    if (m === "bad-sum") assert.match(h.reason, /do not add up/)
  }
})

test("cutoff is inclusive: dated on the cutoff is drafted, the day before is skipped", () => {
  const r = planDrafts([inv({ id: "on", invoiceDate: "2026-11-04" }), inv({ id: "before", invoiceNumber: "CB-77002", invoiceDate: "2026-11-03" })], orgs(), OPTS)
  assert.deepEqual(r.drafts.map((d) => d.invoiceId), ["on"])
  assert.deepEqual(r.skipped.map((s) => s.invoiceId), ["before"])
})

test("org mapping: a Burleigh invoice never lands in Currumbin, even when only Currumbin has the contact", () => {
  const r = planDrafts([inv({ supplierName: "Hinterland Herbs", invoiceNumber: "HH-5001", subtotal: 40, gst: 4, total: 44 })], orgs(), OPTS)
  assert.equal(r.drafts.length, 0)
  assert.equal(r.holds[0].org, "Tarte Bakery")
  assert.match(r.holds[0].reason, /no Xero contact matches "Hinterland Herbs"/)
  const k = planDrafts([inv({ supplierName: "Hinterland Herbs", venue: "BEACH_HOUSE", invoiceNumber: "HH-5001", subtotal: 40, gst: 4, total: 44 })], orgs(), OPTS)
  assert.equal(k.drafts[0].org, "Tarte Currumbin")
  assert.equal(k.drafts[0].payload.Contact.ContactID, "k-herb")
})

test("a stored known contact id that is no longer an active contact is never used", () => {
  const r = planDrafts([inv({})], orgs(), { ...OPTS, knownContacts: { "Tarte Bakery": { "coastline butter co": "b-archived" } } })
  assert.equal(r.drafts[0].payload.Contact.ContactID, "b-butter")
  assert.equal(r.drafts[0].matchedBy, "exact")
})

test("duplicate by number holds on DELETED and VOIDED bills too; by date and total it ignores them", () => {
  for (const status of ["DELETED", "VOIDED", "DRAFT", "SUBMITTED"]) {
    const o = orgs()
    o["Tarte Currumbin"].bills.push(hist(BUTTER_K, "CB 77001", "2026-11-01", 9.99, [], status))
    const r = planDrafts([inv({})], o, OPTS)
    assert.equal(r.drafts.length, 0, status)
    assert.match(r.holds[0].reason, new RegExp(`^already in Xero: Tarte Currumbin ${status} bill CB 77001`))
  }
  // Same supplier, date and total, other number, in the other org: twin weekly orders, drafted with a note...
  const o = orgs()
  o["Tarte Currumbin"].bills.push(hist(BUTTER_K, "CB-60000", "2026-11-10", 295.9, []))
  const twin = planDrafts([inv({})], o, OPTS)
  assert.equal(twin.drafts.length, 1)
  assert.deepEqual(twin.drafts[0].notes, ["twin in Tarte Currumbin: CB-60000 has the same date and total"])
  // ...unless the numbers are one slip apart (a typo)...
  const typo = orgs()
  typo["Tarte Currumbin"].bills.push(hist(BUTTER_K, "CB-7701", "2026-11-10", 295.9, []))
  assert.match(planDrafts([inv({})], typo, OPTS).holds[0].reason, /^possible duplicate: Tarte Currumbin already has a PAID bill/)
  // ...and in the same org it is always held.
  const same = orgs()
  same["Tarte Bakery"].bills.push(hist(BUTTER, "CB-60000", "2026-11-10", 295.9, []))
  assert.match(planDrafts([inv({})], same, OPTS).holds[0].reason, /^possible duplicate: Tarte Bakery already has a PAID bill/)
  // ...a deleted one does not.
  const d = orgs()
  d["Tarte Currumbin"].bills.push(hist(BUTTER_K, "CB-60000", "2026-11-10", 295.9, [], "DELETED"))
  assert.equal(planDrafts([inv({})], d, OPTS).drafts.length, 1)
})

test("a credit or nil amount is never drafted, whatever its status says", () => {
  const r = planDrafts(
    [
      inv({ id: "neg", subtotal: -269, gst: -26.9, total: -295.9 }),
      inv({ id: "negsub", invoiceNumber: "CB-77003", subtotal: -10, gst: 0, total: 5 }),
      inv({ id: "zero", invoiceNumber: "CB-77004", subtotal: 0, gst: 0, total: 0 }),
      inv({ id: "nototal", invoiceNumber: "CB-77005", total: null }),
    ],
    orgs(),
    OPTS
  )
  assert.equal(r.drafts.length, 0)
  assert.equal(r.holds.length, 4)
})

test("date suspect window: bills exactly 30 and 120 days back count, 29 and 121 do not", () => {
  const b = (n: string, d: string) => ({ InvoiceNumber: n, Date: d, org: "Tarte Bakery" as BillOrg })
  // Invoice 2026-11-10: 30 days back is 2026-10-11, 120 days back is 2026-07-13.
  const edges = [b("50010", "2026-10-11"), b("50020", "2026-07-13"), b("50030", "2026-09-01")]
  assert.equal(dateSuspect("40000", "2026-11-10", edges)?.InvoiceNumber, "50020")
  const outside = [b("50010", "2026-10-12"), b("50020", "2026-07-12"), b("50030", "2026-09-01")]
  assert.equal(dateSuspect("40000", "2026-11-10", outside), null)
})

test("a date-suspect invoice is held even when it would otherwise be a clean draft, across a month end", () => {
  const o = orgs()
  o["Tarte Bakery"].bills.push(
    hist(BUTTER, "CB-88100", "2026-09-30", 10, []),
    hist(BUTTER, "CB-88200", "2026-10-01", 11, []),
    hist(BUTTER, "CB-88300", "2026-10-02", 12, [])
  )
  const r = planDrafts([inv({ invoiceNumber: "CB-81000", invoiceDate: "2026-11-04" }), inv({ id: "ok", invoiceNumber: "CB-88400", invoiceDate: "2026-11-04" })], o, OPTS)
  assert.deepEqual(r.drafts.map((d) => d.invoiceId), ["ok"])
  assert.match(r.holds[0].reason, /^date suspect: number CB-81000/)
})

test("no em dash in any hold or skip reason across the random batch", () => {
  const r = planDrafts(
    [inv({ supplierName: "Nobody Pty Ltd" }), inv({ id: "v", venue: "TEA_GARDEN" }), inv({ id: "s", status: "STATEMENT" }), inv({ id: "g", subtotal: 100, gst: 50, total: 150 })],
    orgs(),
    OPTS
  )
  for (const t of [...r.holds.map((h) => h.reason), ...r.skipped.map((s) => s.reason)]) assert.ok(!t.includes("—"), t)
})

test("a held first copy still blocks a second copy at the other venue, whatever the number's punctuation", () => {
  const r = planDrafts([inv({ id: "first", venue: "BOTH", invoiceDate: "2026-11-09" }), inv({ id: "second", venue: "BEACH_HOUSE", invoiceNumber: "CB 77001" })], orgs(), OPTS)
  assert.equal(r.drafts.length, 0)
  const why = Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason]))
  assert.equal(why.first, "needs venue (Kitchen says BOTH)")
  assert.match(why.second, /in Kitchen twice/)
})

test("cross-org duplicate by number when the other org names the supplier differently, through its learned contact", () => {
  const o = orgs()
  const GC = { ContactID: "k-butter-gc", Name: "CB Dairy Gold Coast" }
  o["Tarte Currumbin"].contacts.push(GC)
  o["Tarte Currumbin"].bills.push(hist(GC, "CB-77001", "2026-11-10", 295.9, [], "AUTHORISED"))
  const known = { "Tarte Currumbin": { "coastline butter co": "k-butter-gc" } }
  const r = planDrafts([inv({})], o, { ...OPTS, knownContacts: known })
  assert.equal(r.drafts.length, 0)
  assert.match(r.holds[0].reason, /^already in Xero: Tarte Currumbin AUTHORISED bill CB-77001/)
  // The draft carries each org's contact for the check right before create.
  const clean = planDrafts([inv({ invoiceNumber: "CB-77009", invoiceDate: "2026-11-11" })], o, { ...OPTS, knownContacts: known })
  assert.deepEqual(clean.drafts[0].contactIds, { "Tarte Bakery": "b-butter", "Tarte Currumbin": "k-butter-gc" })
})

test("GST is judged in whole cents, so exactly 2 cents either way is still 10% on big invoices too", () => {
  assert.equal(gstKindOf(1234.5, 123.43), "ten")
  assert.equal(gstKindOf(1234.5, 123.47), "ten")
  assert.equal(gstKindOf(1234.5, 123.42), null)
  assert.equal(gstKindOf(98765.43, 9876.56), "ten")
  assert.equal(gstKindOf(98765.43, 9876.52), null)
  assert.equal(gstKindOf(50, 0.02), "nil")
  assert.equal(gstKindOf(50, -0.02), "nil")
  assert.equal(gstKindOf(50, 0.03), null)
  const r = planDrafts([inv({ subtotal: 1234.5, gst: 123.43, total: 1357.93 })], orgs(), OPTS)
  assert.equal(r.drafts[0].payload.LineItems[0].TaxAmount, 123.43)
})

test("a document date with an impossible month is held, never sent to Xero", () => {
  const r = planDrafts([inv({ documentDate: "2026-13-01" })], orgs(), OPTS)
  assert.equal(r.drafts.length, 0)
  assert.match(r.holds[0].reason, /could not be read/)
})
