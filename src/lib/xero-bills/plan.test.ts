import { test } from "node:test"
import assert from "node:assert/strict"
import {
  codingFor,
  dateSuspect,
  lastBillDates,
  oneSlipApart,
  numberParts,
  coreName,
  gstKindOf,
  learnKnownContacts,
  looseName,
  matchContact,
  normNumber,
  planDrafts,
  type BillOrg,
  type KitchenInvoice,
  type OrgRead,
  type XeroBill,
} from "./plan"

// Made-up suppliers and figures only: this repo is public.
const BAKERY_CONTACTS = [
  { ContactID: "c-flour", Name: "Sunny Flour Mills Pty Ltd" },
  { ContactID: "c-dairy", Name: "Hilltop Dairy" },
  { ContactID: "c-veg", Name: "Green Crate Produce" },
  { ContactID: "c-twin1", Name: "Twin Foods" },
  { ContactID: "c-twin2", Name: "TWIN FOODS." },
]
const CURRUMBIN_CONTACTS = [
  { ContactID: "k-dairy", Name: "Hilltop Dairy" },
  { ContactID: "k-fish", Name: "Reef & Line Seafood" },
]

const bill = (p: Partial<XeroBill> & { Contact: XeroBill["Contact"]; Date: string }): XeroBill => ({
  InvoiceID: `x-${Math.random().toString(36).slice(2, 8)}`,
  Type: "ACCPAY",
  Status: "AUTHORISED",
  ...p,
})

function orgs(): Record<BillOrg, OrgRead> {
  return {
    "Tarte Bakery": {
      contacts: BAKERY_CONTACTS,
      bills: [
        bill({ Contact: { ContactID: "c-flour", Name: "Sunny Flour Mills Pty Ltd" }, Date: "2026-10-01", DueDate: "2026-10-31", InvoiceNumber: "F-100", Total: 110, LineItems: [{ AccountCode: "310", TaxType: "INPUT", LineAmount: 100 }] }),
        bill({ Contact: { ContactID: "c-flour", Name: "Sunny Flour Mills Pty Ltd" }, Date: "2026-11-01", DueDate: "2026-11-15", InvoiceNumber: "F-101", Total: 220, Status: "PAID", LineItems: [{ AccountCode: "311", TaxType: "INPUT", LineAmount: 200 }] }),
        bill({ Contact: { ContactID: "c-dairy", Name: "Hilltop Dairy" }, Date: "2026-11-02", DueDate: "2026-11-09", InvoiceNumber: "D-7", Total: 50, LineItems: [{ AccountCode: "312", TaxType: "EXEMPTEXPENSES", LineAmount: 50 }] }),
        // A draft only: never used for coding.
        bill({ Contact: { ContactID: "c-veg", Name: "Green Crate Produce" }, Date: "2026-11-03", Status: "DRAFT", InvoiceNumber: "G-1", Total: 30, LineItems: [{ AccountCode: "313", TaxType: "EXEMPTEXPENSES", LineAmount: 30 }] }),
      ],
    },
    "Tarte Currumbin": {
      contacts: CURRUMBIN_CONTACTS,
      bills: [
        bill({ Contact: { ContactID: "k-fish", Name: "Reef & Line Seafood" }, Date: "2026-11-02", DueDate: "2026-11-16", InvoiceNumber: "R-55", Total: 330, LineItems: [{ AccountCode: "320", TaxType: "INPUT", LineAmount: 300, Tracking: [{ Name: "Venue", Option: "Beach House" }] }] }),
        bill({ Contact: { ContactID: "k-dairy", Name: "Hilltop Dairy" }, Date: "2026-11-04", InvoiceNumber: "D-9", Total: 77, Status: "DRAFT", Url: "https://app.dext.com/x", LineItems: [{ AccountCode: "312", TaxType: "EXEMPTEXPENSES", LineAmount: 77 }] }),
      ],
    },
  }
}

const inv = (p: Partial<KitchenInvoice>): KitchenInvoice => ({
  id: "inv1",
  supplierName: "Sunny Flour Mills Pty Ltd",
  venue: "BURLEIGH",
  invoiceNumber: "F-200",
  invoiceDate: "2026-11-10",
  dueDate: null,
  subtotal: 100,
  gst: 10,
  total: 110,
  status: "EXTRACTED",
  hasPdf: true,
  ...p,
})

const OPTS = { cutoff: "2026-11-09", kitchenBaseUrl: "https://kitchen.example.test/" }

test("a clean taxable invoice becomes one DRAFT ACCPAY bill coded from the latest approved bill", () => {
  const r = planDrafts([inv({})], orgs(), OPTS)
  assert.equal(r.holds.length, 0, JSON.stringify(r.holds))
  assert.equal(r.drafts.length, 1)
  const d = r.drafts[0]
  assert.equal(d.org, "Tarte Bakery")
  assert.equal(d.payload.Status, "DRAFT")
  assert.equal(d.payload.Type, "ACCPAY")
  assert.equal(d.payload.Contact.ContactID, "c-flour")
  assert.equal(d.payload.LineAmountTypes, "Exclusive")
  assert.deepEqual(d.payload.LineItems, [
    { Description: "Sunny Flour Mills Pty Ltd F-200", Quantity: 1, UnitAmount: 100, AccountCode: "311", TaxType: "INPUT", TaxAmount: 10 },
  ])
  assert.equal(d.codedFrom.invoiceNumber, "F-101")
  // Terms from the last bill: 14 days.
  assert.equal(d.payload.DueDate, "2026-11-24")
  assert.equal(d.payload.Reference, "Kitchen inv1")
  assert.equal(d.payload.Url, "https://kitchen.example.test/api/invoices/inv1/pdf")
})

test("the invoice's own due date wins over the supplier's usual terms", () => {
  const r = planDrafts([inv({ dueDate: "2026-11-30" })], orgs(), OPTS)
  assert.equal(r.drafts[0].payload.DueDate, "2026-11-30")
  // A due date before the invoice date is ignored.
  const bad = planDrafts([inv({ dueDate: "2026-11-01" })], orgs(), OPTS)
  assert.equal(bad.drafts[0].payload.DueDate, "2026-11-24")
})

test("a GST-free invoice takes a GST-free coding; tracking is copied from the coded line", () => {
  const r = planDrafts(
    [inv({ id: "i2", supplierName: "Reef and Line Seafood", venue: "BEACH_HOUSE", invoiceNumber: "R-60", subtotal: 300, gst: 30, total: 330 })],
    orgs(),
    OPTS
  )
  assert.equal(r.drafts.length, 1, JSON.stringify(r.holds))
  assert.equal(r.drafts[0].org, "Tarte Currumbin")
  assert.equal(r.drafts[0].matchedBy, "loose")
  assert.deepEqual(r.drafts[0].payload.LineItems[0].Tracking, [{ Name: "Venue", Option: "Beach House" }])
  const nil = planDrafts([inv({ id: "i3", supplierName: "Hilltop Dairy", invoiceNumber: "D-8", subtotal: 50, gst: 0, total: 50 })], orgs(), OPTS)
  assert.equal(nil.drafts.length, 1, JSON.stringify(nil.holds))
  assert.equal(nil.drafts[0].payload.LineItems[0].TaxType, "EXEMPTEXPENSES")
  assert.equal(nil.drafts[0].payload.LineItems[0].TaxAmount, 0)
  assert.equal(nil.drafts[0].payload.DueDate, "2026-11-17")
})

test("holds: no contact, ambiguous contact, no approved history, wrong GST kind for the history", () => {
  const r = planDrafts(
    [
      inv({ id: "a", supplierName: "Brand New Supplier" }),
      inv({ id: "b", supplierName: "twin foods" }),
      inv({ id: "c", supplierName: "Green Crate Produce", subtotal: 30, gst: 0, total: 30, invoiceNumber: "G-2" }),
      inv({ id: "d", supplierName: "Hilltop Dairy", invoiceNumber: "D-10" }),
    ],
    orgs(),
    OPTS
  )
  assert.equal(r.drafts.length, 0)
  const why = Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason]))
  assert.match(why.a, /no Xero contact matches "Brand New Supplier" \(contacts are never created\)/)
  assert.match(why.b, /more than one Xero contact matches/)
  assert.match(why.c, /no approved bill from this supplier/)
  assert.match(why.d, /has GST but the supplier's approved bills in Xero are all GST-free/)
})

test("holds: GST neither 10% nor nil, figures that do not add up, no number, credit amounts", () => {
  const r = planDrafts(
    [
      inv({ id: "mixed", invoiceNumber: "F-501", subtotal: 100, gst: 4.5, total: 104.5 }),
      inv({ id: "sum", invoiceNumber: "F-502", subtotal: 100, gst: 10, total: 111 }),
      inv({ id: "num", invoiceNumber: "  " }),
      inv({ id: "neg", invoiceNumber: "F-504", subtotal: -100, gst: -10, total: -110 }),
      inv({ id: "nul", invoiceNumber: "F-505", subtotal: null }),
    ],
    orgs(),
    OPTS
  )
  assert.equal(r.drafts.length, 0)
  const why = Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason]))
  assert.match(why.mixed, /GST does not reconcile: 4\.50 on 100\.00/)
  assert.match(why.sum, /do not add up/)
  assert.match(why.num, /no invoice number/)
  assert.match(why.neg, /credit notes come in a later phase/)
  const zero = planDrafts([inv({ id: "z", subtotal: 0, gst: 0, total: 0 })], orgs(), OPTS)
  assert.equal(zero.holds[0].reason, "total is nil (a delivery docket or a misread invoice)")
  assert.match(why.nul, /no subtotal or total/)
})

test("GST within 2 cents of 10% is taxable and the Kitchen GST is kept, so the total ties to the cent", () => {
  const r = planDrafts([inv({ subtotal: 123.45, gst: 12.36, total: 135.81 })], orgs(), OPTS)
  assert.equal(r.drafts.length, 1)
  assert.equal(r.drafts[0].payload.LineItems[0].TaxAmount, 12.36)
  assert.equal(gstKindOf(100, 10.02), "ten")
  assert.equal(gstKindOf(100, 10.03), null)
  assert.equal(gstKindOf(100, 0.02), "nil")
})

test("duplicates: same supplier and number in either org, any status, including a Dext draft", () => {
  const o = orgs()
  const r = planDrafts(
    [
      // Already a PAID bill in Bakery as "F-101".
      inv({ id: "same", invoiceNumber: "f101" }),
      // Hilltop Dairy D-9 is a Dext draft in Currumbin; this Kitchen copy is Burleigh's.
      inv({ id: "cross", supplierName: "Hilltop Dairy", invoiceNumber: "D-0009", subtotal: 77, gst: 0, total: 77 }),
      // Same number from a different supplier is not a duplicate.
      inv({ id: "other", supplierName: "Hilltop Dairy", invoiceNumber: "F-101", subtotal: 50, gst: 0, total: 50 }),
    ],
    o,
    OPTS
  )
  const why = Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason]))
  assert.match(why.same, /already in Xero: Tarte Bakery PAID bill F-101/)
  assert.match(why.cross, /already in Xero: Tarte Currumbin DRAFT bill D-9 dated 2026-11-04 \(Dext\)/)
  assert.deepEqual(r.drafts.map((d) => d.invoiceId), ["other"])
})

test("possible duplicate: same supplier, date and total under another number", () => {
  const r = planDrafts([inv({ invoiceNumber: "NEW-1", invoiceDate: "2026-11-01", subtotal: 200, gst: 20, total: 220 })], orgs(), { cutoff: "2026-11-01" })
  assert.equal(r.drafts.length, 0)
  assert.match(r.holds[0].reason, /possible duplicate: Tarte Bakery already has a PAID bill from this supplier dated 2026-11-01 for the same total, numbered F-101/)
})

test("the same invoice twice in Kitchen drafts once", () => {
  const r = planDrafts([inv({ id: "one" }), inv({ id: "two", invoiceNumber: "F 200" })], orgs(), OPTS)
  assert.deepEqual(r.drafts.map((d) => d.invoiceId), ["one"])
  assert.match(r.holds[0].reason, /in Kitchen twice/)
})

test("never pushed: other statuses, pushed rows, before the cutoff; BOTH, Tea Garden and no venue are held", () => {
  const r = planDrafts(
    [
      inv({ id: "s1", status: "STATEMENT" }),
      inv({ id: "s2", status: "CREDIT_NOTE" }),
      inv({ id: "s3", status: "DUPLICATE" }),
      inv({ id: "s4", status: "ORDER_CONFIRMATION" }),
      inv({ id: "s5", xeroInvoiceId: "already" }),
      inv({ id: "s6", invoiceDate: "2026-11-08" }),
      inv({ id: "s7", invoiceDate: null }),
      inv({ id: "h1", venue: "BOTH", invoiceNumber: "F-601" }),
      inv({ id: "h2", venue: "TEA_GARDEN", invoiceNumber: "F-602" }),
      inv({ id: "h3", venue: null, invoiceNumber: "F-603" }),
    ],
    orgs(),
    OPTS
  )
  assert.equal(r.drafts.length, 0)
  assert.deepEqual(r.skipped.map((s) => s.invoiceId).sort(), ["s1", "s2", "s3", "s4", "s5", "s6", "s7"])
  assert.deepEqual(Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason])), {
    h1: "needs venue (Kitchen says BOTH)",
    h2: "needs venue (Kitchen says TEA_GARDEN)",
    h3: "needs venue (Kitchen says none)",
  })
})

test("cap per org: the rest are held for the next run, not dropped", () => {
  const r = planDrafts(
    [inv({ id: "a", invoiceNumber: "F-301" }), inv({ id: "b", invoiceNumber: "F-302" }), inv({ id: "c", invoiceNumber: "F-303" })],
    orgs(),
    { ...OPTS, capPerOrg: 2 }
  )
  assert.equal(r.drafts.length, 2)
  assert.match(r.holds[0].reason, /over today's cap of 2 drafts for Tarte Bakery/)
})

test("name and number normalising", () => {
  assert.equal(looseName("Reef & Line Seafood"), "reef and line seafood")
  assert.equal(coreName("The Sunny Flour Mills Pty. Ltd."), "sunny flour mills")
  assert.equal(normNumber("INV-000123"), "123")
  assert.equal(normNumber("ab/0045"), "AB45")
  assert.equal(normNumber("  "), "")
  assert.equal(normNumber(null), "")
})

test("contact match tiers: known id, exact, loose, core (company suffixes); a short core name never matches", () => {
  assert.equal((matchContact("anything", BAKERY_CONTACTS, { anything: "c-veg" }) as { tier: string }).tier, "known")
  assert.equal((matchContact("Hilltop Dairy", BAKERY_CONTACTS) as { tier: string }).tier, "exact")
  assert.equal((matchContact("hilltop  dairy!", BAKERY_CONTACTS) as { tier: string }).tier, "loose")
  assert.equal((matchContact("Sunny Flour Mills", BAKERY_CONTACTS) as { tier: string }).tier, "core")
  assert.equal(matchContact("Co", [{ ContactID: "z", Name: "Co Pty Ltd" }]).contact, null)
})

test("codingFor reads lines of the wanted GST kind across the recent bills, the biggest account by amount wins", () => {
  const bills: XeroBill[] = [
    bill({ Contact: { ContactID: "m" }, Date: "2026-11-05", LineItems: [{ AccountCode: "400", TaxType: "EXEMPTEXPENSES", LineAmount: 80 }] }),
    bill({ Contact: { ContactID: "m" }, Date: "2026-10-05", LineItems: [{ AccountCode: "401", TaxType: "INPUT", LineAmount: 20 }, { AccountCode: "402", TaxType: "INPUT", LineAmount: -90 }] }),
  ]
  const c = codingFor("m", bills, "ten")
  assert.ok(!("reason" in c))
  if ("reason" in c) return
  // Most money by size, credits included.
  assert.equal(c.accountCode, "402")
  assert.equal(c.fromDate, "2026-10-05")
  assert.equal(c.termsDays, null)
})

test("learnKnownContacts keeps a supplier only when every entered invoice points to one contact", () => {
  const o = orgs()
  const known = learnKnownContacts(
    [
      { supplierName: "SFM Online", venue: "BURLEIGH", invoiceNumber: "F-100", invoiceDate: "2026-10-01", total: 110 },
      { supplierName: "SFM Online", venue: "BURLEIGH", invoiceNumber: "F-101", invoiceDate: "2026-11-01", total: 220 },
      // Total differs: not counted.
      { supplierName: "Dairy Direct", venue: "BURLEIGH", invoiceNumber: "D-7", invoiceDate: "2026-11-02", total: 51 },
    ],
    o
  )
  assert.deepEqual(known["Tarte Bakery"], { "sfm online": "c-flour" })
  const r = planDrafts([inv({ supplierName: "SFM Online" })], o, { ...OPTS, knownContacts: known })
  assert.equal(r.drafts[0].matchedBy, "known")
  assert.equal(r.drafts[0].payload.Contact.ContactID, "c-flour")
})

test("no em dash in any hold reason", () => {
  const r = planDrafts([inv({ supplierName: "Nobody" }), inv({ id: "x", subtotal: 100, gst: 3, total: 103 })], orgs(), OPTS)
  for (const h of r.holds) assert.ok(!h.reason.includes("—"), h.reason)
})

const MIXED_ORGS = (): Record<BillOrg, OrgRead> => {
  const o = orgs()
  const W = { ContactID: "c-whole", Name: "Broad Wholesale" }
  o["Tarte Bakery"].contacts = [...o["Tarte Bakery"].contacts, W]
  o["Tarte Bakery"].bills = [
    ...o["Tarte Bakery"].bills,
    bill({ Contact: W, Date: "2026-11-05", DueDate: "2026-11-12", InvoiceNumber: "W-3", Total: 165, LineItems: [{ AccountCode: "501", TaxType: "EXEMPTEXPENSES", LineAmount: 100 }, { AccountCode: "520", TaxType: "INPUT", LineAmount: 50 }] }),
    bill({ Contact: W, Date: "2026-11-01", InvoiceNumber: "W-2", Total: 88, LineItems: [{ AccountCode: "530", TaxType: "INPUT", LineAmount: 80 }] }),
    bill({ Contact: W, Date: "2026-10-25", InvoiceNumber: "W-1", Total: 33, LineItems: [{ AccountCode: "520", TaxType: "INPUT", LineAmount: 20 }, { AccountCode: "520", TaxType: "INPUT", LineAmount: 20 }] }),
  ]
  return o
}

test("splitMixed: GST between nil and 10% becomes two lines, GST items and GST-free items, tying to the cent", () => {
  const i = inv({ id: "m1", supplierName: "Broad Wholesale", invoiceNumber: "W-9", subtotal: 250.4, gst: 7.25, total: 257.65 })
  // Off by default: held, as the spec says.
  assert.match(planDrafts([i], MIXED_ORGS(), OPTS).holds[0].reason, /GST does not reconcile/)
  const r = planDrafts([i], MIXED_ORGS(), { ...OPTS, splitMixed: true })
  assert.equal(r.drafts.length, 1, JSON.stringify(r.holds))
  const d = r.drafts[0]
  assert.equal(d.split, true)
  // Taxable account: 530 carried 80, 520 carried 50 + 40 = 90, so 520 wins.
  assert.deepEqual(d.payload.LineItems, [
    { Description: "Broad Wholesale W-9 (GST items)", Quantity: 1, UnitAmount: 72.5, AccountCode: "520", TaxType: "INPUT", TaxAmount: 7.25 },
    { Description: "Broad Wholesale W-9 (GST-free items)", Quantity: 1, UnitAmount: 177.9, AccountCode: "501", TaxType: "EXEMPTEXPENSES", TaxAmount: 0 },
  ])
  const sum = d.payload.LineItems.reduce((s, l) => s + Math.round(l.UnitAmount * 100) + Math.round(l.TaxAmount * 100), 0)
  assert.equal(sum, 25765)
  assert.equal(d.payload.DueDate, "2026-11-17")
})

test("splitMixed holds: no GST-free history, GST over 10%, parts under a dollar", () => {
  const o = MIXED_ORGS()
  const r = planDrafts(
    [
      // Sunny Flour has only taxable bills.
      inv({ id: "a", subtotal: 100, gst: 5, total: 105 }),
      inv({ id: "b", supplierName: "Broad Wholesale", invoiceNumber: "W-10", subtotal: 100, gst: 12, total: 112 }),
      inv({ id: "c", supplierName: "Broad Wholesale", invoiceNumber: "W-11", subtotal: 100, gst: 0.05, total: 100.05 }),
    ],
    o,
    { ...OPTS, splitMixed: true }
  )
  assert.equal(r.drafts.length, 0)
  const why = Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason]))
  assert.match(why.a, /no GST-free account to copy/)
  assert.match(why.b, /GST does not reconcile/)
  assert.match(why.c, /GST does not reconcile/)
})

test("learnKnownContacts allows the entered bill's date to be up to a week off, and needs two matches", () => {
  const h = (n: string, d: string, t: number) => ({ supplierName: "SFM Online", venue: "BURLEIGH", invoiceNumber: n, invoiceDate: d, total: t })
  // F-100 is dated 1 Oct and F-101 1 Nov in Xero: both within a week.
  assert.deepEqual(learnKnownContacts([h("F-100", "2026-10-04", 110), h("F-101", "2026-10-27", 220)], orgs())["Tarte Bakery"], { "sfm online": "c-flour" })
  // One match alone could be chance.
  assert.deepEqual(learnKnownContacts([h("F-101", "2026-10-27", 220)], orgs())["Tarte Bakery"], {})
  // Too far off: not a match.
  assert.deepEqual(learnKnownContacts([h("F-100", "2026-10-04", 110), h("F-101", "2026-10-20", 220)], orgs())["Tarte Bakery"], {})
})

test("splitMixed: a taxable fee outside the subtotal (GST-free goods plus a delivery fee) becomes two lines", () => {
  const o = MIXED_ORGS()
  // Goods 583.00 GST-free, a 3.00 fee with 0.30 GST, total 586.30.
  const i = inv({ id: "fee", supplierName: "Broad Wholesale", invoiceNumber: "W-20", subtotal: 583, gst: 0.3, total: 586.3 })
  assert.match(planDrafts([i], o, OPTS).holds[0].reason, /do not add up/)
  const r = planDrafts([i], o, { ...OPTS, splitMixed: true })
  assert.equal(r.drafts.length, 1, JSON.stringify(r.holds))
  assert.deepEqual(
    r.drafts[0].payload.LineItems.map((l) => [l.UnitAmount, l.TaxType, l.TaxAmount]),
    [
      [3, "INPUT", 0.3],
      [583, "EXEMPTEXPENSES", 0],
    ]
  )
  // A fee whose GST rounds (4.55 ex, 0.45 GST) still fits.
  const round = planDrafts([inv({ id: "r", supplierName: "Broad Wholesale", invoiceNumber: "W-21", subtotal: 1018.14, gst: 0.45, total: 1023.14 })], o, { ...OPTS, splitMixed: true })
  assert.equal(round.drafts.length, 1, JSON.stringify(round.holds))
  assert.equal(round.drafts[0].payload.LineItems[0].UnitAmount, 4.55)
  // Anything else that does not add up is still held.
  const off = planDrafts([inv({ id: "o", supplierName: "Broad Wholesale", invoiceNumber: "W-22", subtotal: 100, gst: 14, total: 150 })], o, { ...OPTS, splitMixed: true })
  assert.match(off.holds[0].reason, /do not add up/)
})

test("learnKnownContacts: one bill keyed under the wrong supplier is ignored; two real contacts, the most recent wins", () => {
  const o = orgs()
  o["Tarte Bakery"].contacts.push({ ContactID: "c-pane-old", Name: "Pane Co" }, { ContactID: "c-pane-new", Name: "Pane Co Pty Ltd" })
  const b = (id: string, n: string, d: string, t: number) => bill({ Contact: { ContactID: id }, Date: d, InvoiceNumber: n, Total: t })
  o["Tarte Bakery"].bills.push(
    b("c-pane-old", "P-1", "2026-09-01", 10),
    b("c-pane-old", "P-2", "2026-09-08", 11),
    b("c-pane-old", "P-3", "2026-09-15", 12),
    b("c-pane-new", "P-4", "2026-10-20", 13),
    b("c-pane-new", "P-5", "2026-10-27", 14),
    // The newest one keyed under another supplier by mistake.
    b("c-dairy", "P-6", "2026-11-03", 15)
  )
  const h = (n: string, d: string, t: number) => ({ supplierName: "Pane Co", venue: "BURLEIGH", invoiceNumber: n, invoiceDate: d, total: t })
  const hist = [h("P-1", "2026-09-01", 10), h("P-2", "2026-09-08", 11), h("P-3", "2026-09-15", 12), h("P-4", "2026-10-20", 13), h("P-5", "2026-10-27", 14), h("P-6", "2026-11-03", 15)]
  assert.deepEqual(learnKnownContacts(hist, o)["Tarte Bakery"], { "pane co": "c-pane-new" })
})

test("two contacts with the same name: the one on the most recent bill wins; no bills to tell them apart is a hold", () => {
  const twins = [
    { ContactID: "c-twin1", Name: "Twin Foods" },
    { ContactID: "c-twin2", Name: "TWIN FOODS." },
  ]
  const dates = lastBillDates([
    bill({ Contact: { ContactID: "c-twin1" }, Date: "2026-10-01" }),
    bill({ Contact: { ContactID: "c-twin2" }, Date: "2026-11-02" }),
    // A voided bill does not count as use.
    bill({ Contact: { ContactID: "c-twin1" }, Date: "2026-11-09", Status: "VOIDED" }),
  ])
  const m = matchContact("twin foods", twins, undefined, dates)
  assert.equal(m.contact?.ContactID, "c-twin2")
  assert.equal(matchContact("twin foods", twins).contact, null)
  assert.equal(matchContact("twin foods", twins, undefined, new Map([["c-twin1", "2026-11-01"], ["c-twin2", "2026-11-01"]])).contact, null)
})

test("date suspect: a number below the supplier's sequence from one to four months back is held, never drafted", () => {
  const o = orgs()
  const EGG = { ContactID: "c-egg", Name: "Sunrise Eggs" }
  o["Tarte Bakery"].contacts.push(EGG)
  const egg = (n: string, d: string) => bill({ Contact: EGG, Date: d, InvoiceNumber: n, Total: 55, LineItems: [{ AccountCode: "51050", TaxType: "EXEMPTEXPENSES", LineAmount: 55 }] })
  o["Tarte Bakery"].bills.push(
    egg("294100", "2026-08-01"),
    egg("295200", "2026-08-29"),
    egg("296206", "2026-09-12"),
    // One mis-keyed high number in June cannot raise a hold on its own.
    egg("299305", "2026-07-20"),
    egg("301990", "2026-11-02")
  )
  // The same supplier at the other company counts too.
  o["Tarte Currumbin"].contacts.push({ ContactID: "k-egg", Name: "Sunrise Eggs" })
  o["Tarte Currumbin"].bills.push(bill({ Contact: { ContactID: "k-egg", Name: "Sunrise Eggs" }, Date: "2026-09-20", InvoiceNumber: "296500", Total: 1 }))
  const r = planDrafts(
    [
      inv({ id: "old", supplierName: "Sunrise Eggs", invoiceNumber: "290275", invoiceDate: "2026-11-09", subtotal: 40, gst: 0, total: 40 }),
      inv({ id: "new", supplierName: "Sunrise Eggs", invoiceNumber: "302114", invoiceDate: "2026-11-09", subtotal: 41, gst: 0, total: 41 }),
      // Below the June outlier and below 301990 from last week: still normal.
      inv({ id: "near", supplierName: "Sunrise Eggs", invoiceNumber: "298250", invoiceDate: "2026-11-09", subtotal: 42, gst: 0, total: 42 }),
    ],
    o,
    OPTS
  )
  assert.deepEqual(r.drafts.map((d) => d.invoiceId).sort(), ["near", "new"])
  assert.equal(r.holds.length, 1)
  assert.equal(r.holds[0].invoiceId, "old")
  assert.match(r.holds[0].reason, /^date suspect: number 290275 is below most of this supplier's numbers from one to four months earlier \(for example 296206 on 2026-09-12, Tarte Bakery\)/)
})

test("date suspect needs three comparable numbers of the same prefix and length", () => {
  const b = (n: string, d: string, org: BillOrg = "Tarte Bakery") => ({ InvoiceNumber: n, Date: d, org })
  const three = [b("INV-9000", "2026-08-01"), b("INV-9100", "2026-08-20", "Tarte Currumbin"), b("INV-9200", "2026-09-05")]
  assert.equal(dateSuspect("INV-1200", "2026-11-09", three)?.InvoiceNumber, "INV-9100")
  assert.equal(dateSuspect("INV-9300", "2026-11-09", three), null)
  // Two is not enough; a different prefix or length is another sequence.
  assert.equal(dateSuspect("INV-1200", "2026-11-09", three.slice(0, 2)), null)
  assert.equal(dateSuspect("CRN-1200", "2026-11-09", three), null)
  assert.equal(dateSuspect("12000", "2026-11-09", three.map((x) => ({ ...x, InvoiceNumber: x.InvoiceNumber.replace("INV-", "") + "00" }))), null)
  // Bills under a month old are not compared (deliveries arrive out of order).
  assert.equal(dateSuspect("INV-1200", "2026-11-09", [b("INV-9000", "2026-10-20"), b("INV-9100", "2026-10-25"), b("INV-9200", "2026-11-01")]), null)
  // Numbers that are not a plain sequence are never judged.
  assert.equal(dateSuspect("A1B2", "2026-11-09", three), null)
  assert.deepEqual(numberParts("OMI35877"), { prefix: "OMI", value: 35877, width: 5 })
  assert.equal(numberParts("12"), null)
})

test("resplit flags a supplier whose items spread over several accounts", () => {
  const r = planDrafts([inv({ id: "m2", supplierName: "Broad Wholesale", invoiceNumber: "W-30", subtotal: 250.4, gst: 7.25, total: 257.65 })], MIXED_ORGS(), { ...OPTS, splitMixed: true })
  // Taxable: 520 carried 90 of 170 (53%), so the approver should re-split.
  assert.equal(r.drafts[0].resplit, true)
  const one = planDrafts([inv({})], orgs(), OPTS)
  // Sunny Flour: 311 carried 200 of 300 (67%).
  assert.equal(one.drafts[0].resplit, true)
  const dairy = planDrafts([inv({ id: "d", supplierName: "Hilltop Dairy", invoiceNumber: "D-8", subtotal: 50, gst: 0, total: 50 })], orgs(), OPTS)
  assert.equal(dairy.drafts[0].resplit, false)
})

test("oneSlipApart: a typo is one slip; the next number in a plain sequence is not", () => {
  assert.equal(oneSlipApart("297584", "297586"), false)
  // One digit far off is a misread, not the next in the sequence.
  assert.equal(oneSlipApart("290275", "290215"), true)
  assert.equal(oneSlipApart("297584", "297548"), true)
  assert.equal(oneSlipApart("297584", "29758"), true)
  assert.equal(oneSlipApart("INV12A", "INV12B"), true)
  assert.equal(oneSlipApart("1234", "4321"), false)
})

test("document date: an old invoice re-sent is held; a document date within a week is the bill's date", () => {
  const old = planDrafts([inv({ documentDate: "2026-02-27", invoiceDate: "2026-11-09" })], orgs(), OPTS)
  assert.equal(old.drafts.length, 0)
  assert.match(old.holds[0].reason, /^date suspect: the document is dated 2026-02-27 but Kitchen filed it under 2026-11-09/)
  const near = planDrafts([inv({ documentDate: "2026-11-08", invoiceDate: "2026-11-10" })], orgs(), { cutoff: "2026-11-08" })
  assert.equal(near.drafts[0].payload.Date, "2026-11-08")
  // The cutoff applies to the bill's own date too.
  const early = planDrafts([inv({ documentDate: "2026-11-08", invoiceDate: "2026-11-10" })], orgs(), { cutoff: "2026-11-09" })
  assert.equal(early.drafts.length, 0)
  assert.match(early.skipped[0].reason, /before the cutoff/)
  // A day that does not exist is held, not sent to Xero.
  assert.match(planDrafts([inv({ documentDate: "2026-02-30", invoiceDate: "2026-02-28" })], orgs(), { cutoff: "2026-01-01" }).holds[0].reason, /could not be read/)
  const bad = planDrafts([inv({ documentDate: "27/02/2026" })], orgs(), OPTS)
  assert.match(bad.holds[0].reason, /could not be read/)
})

test("already paid on the document: a nil balance or the amount received equal to the total is held", () => {
  const r = planDrafts(
    [inv({ id: "bal", invoiceNumber: "F-701", balanceDue: 0 }), inv({ id: "rec", invoiceNumber: "F-702", amountReceived: 110 }), inv({ id: "part", invoiceNumber: "F-703", amountReceived: 50, balanceDue: 60 })],
    orgs(),
    OPTS
  )
  const why = Object.fromEntries(r.holds.map((h) => [h.invoiceId, h.reason]))
  assert.match(why.bal, /balance of 0\.00/)
  assert.match(why.rec, /amount received equals the total/)
  // Part paid: drafting the full total would overstate what is owed.
  assert.match(why.part, /part of it already paid/)
  assert.equal(r.drafts.length, 0)
})

test("a failed push is held until a person clears it; never tried again on its own", () => {
  const r = planDrafts([inv({ pushError: "Xero did not answer; not found by number afterwards, so not retried" })], orgs(), OPTS)
  assert.equal(r.drafts.length, 0)
  assert.match(r.holds[0].reason, /^the last push failed and is not retried until someone checks it and clears it: Xero did not answer/)
})

test("computed due dates stop at 30 days; a longer one must come off the document", () => {
  const o = orgs()
  o["Tarte Bakery"].bills.push(bill({ Contact: { ContactID: "c-flour" }, Date: "2026-11-05", DueDate: "2027-01-01", InvoiceNumber: "F-150", Total: 110, LineItems: [{ AccountCode: "311", TaxType: "INPUT", LineAmount: 100 }] }))
  const r = planDrafts([inv({})], o, OPTS)
  assert.equal(r.drafts[0].payload.DueDate, "2026-12-10")
  const doc = planDrafts([inv({ dueDate: "2027-01-05" })], o, OPTS)
  assert.equal(doc.drafts[0].payload.DueDate, "2027-01-05")
})

test("APPROVED in Kitchen (price changes resolved) is pushed like EXTRACTED; a quote in the number is held", () => {
  const r = planDrafts([inv({ status: "APPROVED" }), inv({ id: "q", invoiceNumber: 'F"9' })], orgs(), OPTS)
  assert.deepEqual(r.drafts.map((d) => d.invoiceId), ["inv1"])
  assert.match(r.holds[0].reason, /quote or backslash/)
})

test("a same-day same-total bill in the other org with no number is held, not taken as a twin", () => {
  const o = orgs()
  o["Tarte Currumbin"].contacts.push({ ContactID: "k-flour", Name: "Sunny Flour Mills Pty Ltd" })
  o["Tarte Currumbin"].bills.push(bill({ Contact: { ContactID: "k-flour", Name: "Sunny Flour Mills Pty Ltd" }, Date: "2026-11-10", InvoiceNumber: "", Total: 110, Status: "DRAFT" }))
  const r = planDrafts([inv({})], o, OPTS)
  assert.equal(r.drafts.length, 0)
  assert.match(r.holds[0].reason, /^possible duplicate: Tarte Currumbin already has a DRAFT bill from this supplier dated 2026-11-10 for the same total, numbered \(none\)/)
})
