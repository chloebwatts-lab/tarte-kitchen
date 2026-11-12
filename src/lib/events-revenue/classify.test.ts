import { test } from "node:test"
import assert from "node:assert/strict"
import { eventAccountCodes, eventSalesByDay, eventVenue, lineExGst, type XeroSale, type XeroRevenueAccount } from "./classify"

const CURRUMBIN_ACCOUNTS: XeroRevenueAccount[] = [
  { Code: "41000", Name: "Sales - Cafe" },
  { Code: "41500", Name: "Event Sales" },
  { Code: "44097", Name: "Sales - Online" },
  { Code: "41900", Name: "Uber Eats Sales" },
]

const sale = (over: Partial<XeroSale>): XeroSale => ({
  InvoiceID: over.InvoiceID ?? "inv-1",
  Status: over.Status ?? "AUTHORISED",
  Date: over.Date === undefined ? "2026-11-07" : over.Date,
  Reference: over.Reference ?? "",
  LineAmountTypes: over.LineAmountTypes ?? "Inclusive",
  LineItems: over.LineItems ?? [],
})

test("event account codes: names that say event or function, nothing else", () => {
  const codes = eventAccountCodes([...CURRUMBIN_ACCOUNTS, { Code: "41600", Name: "Functions" }, { Code: "41700", Name: "Eventual rebates" }])
  assert.deepEqual([...codes].sort(), ["41500", "41600"])
})

test("line ex GST: inclusive takes the tax off, exclusive and no-tax stand as they are", () => {
  assert.equal(lineExGst({ LineAmount: 1100, TaxAmount: 100 }, "Inclusive"), 1000)
  assert.equal(lineExGst({ LineAmount: 1000, TaxAmount: 100 }, "Exclusive"), 1000)
  assert.equal(lineExGst({ LineAmount: 250, TaxAmount: 0 }, "NoTax"), 250)
  assert.equal(lineExGst({ LineAmount: Number.NaN }, "Inclusive"), 0)
})

test("venue: Burleigh org is Burleigh; Currumbin reads tracking, then the line, then the reference", () => {
  assert.equal(eventVenue("Tarte Bakery", {}, { Description: "Tea Garden high tea" }), "BURLEIGH")
  assert.equal(eventVenue("Tarte Currumbin", {}, { Tracking: [{ Name: "Venue", Option: "Tea Garden" }], Description: "Private High Tea in The Hideout" }), "TEA_GARDEN")
  assert.equal(eventVenue("Tarte Currumbin", { Reference: "Tea Garden booking" }, { Description: "Private High Tea in The Hideout" }), "BEACH_HOUSE")
  assert.equal(eventVenue("Tarte Currumbin", {}, { Description: "High Tea - Tea Garden" }), "TEA_GARDEN")
  assert.equal(eventVenue("Tarte Currumbin", { Reference: "TARTE-2026-00412 Tea Garden" }, { Description: "Set brunch 20 pax" }), "TEA_GARDEN")
  assert.equal(eventVenue("Tarte Currumbin", {}, { Description: "Baby shower, 30 guests" }), "BEACH_HOUSE")
})

test("only event-account lines count: the daily Square invoice, Uber and cake lines never do", () => {
  const rows = eventSalesByDay("Tarte Currumbin", [
    sale({ InvoiceID: "amaka", Reference: "Square 7 Nov", LineItems: [{ AccountCode: "41000", LineAmount: 13200, TaxAmount: 1200 }] }),
    sale({ InvoiceID: "uber", LineItems: [{ AccountCode: "41900", LineAmount: 880, TaxAmount: 80 }] }),
    sale({
      InvoiceID: "evt",
      LineItems: [
        { AccountCode: "41500", Description: "Private High Tea in The Hideout", LineAmount: 2200, TaxAmount: 200 },
        { AccountCode: "44097", Description: "Croquembouche", LineAmount: 330, TaxAmount: 30 },
      ],
    }),
  ], CURRUMBIN_ACCOUNTS)
  assert.deepEqual(rows, [{ date: "2026-11-07", venue: "BEACH_HOUSE", exGst: 2000, invoices: 1 }])
})

test("drafts count, voided and deleted do not; days and venues are kept apart", () => {
  const rows = eventSalesByDay("Tarte Currumbin", [
    sale({ InvoiceID: "a", Status: "DRAFT", LineItems: [{ AccountCode: "41500", Description: "Hideout lunch", LineAmount: 1100, TaxAmount: 100 }] }),
    sale({ InvoiceID: "b", Status: "PAID", LineItems: [{ AccountCode: "41500", Description: "Hideout high tea", LineAmount: 550, TaxAmount: 50 }] }),
    sale({ InvoiceID: "c", Status: "VOIDED", LineItems: [{ AccountCode: "41500", Description: "Hideout cancelled", LineAmount: 9999, TaxAmount: 909 }] }),
    sale({ InvoiceID: "d", Status: "DELETED", LineItems: [{ AccountCode: "41500", LineAmount: 9999, TaxAmount: 909 }] }),
    sale({ InvoiceID: "e", Date: "2026-11-08", LineItems: [{ AccountCode: "41500", Description: "High Tea - Tea Garden", LineAmount: 770, TaxAmount: 70 }] }),
    sale({ InvoiceID: "f", Date: null, LineItems: [{ AccountCode: "41500", LineAmount: 100, TaxAmount: 0 }] }),
  ], CURRUMBIN_ACCOUNTS)
  assert.deepEqual(rows, [
    { date: "2026-11-07", venue: "BEACH_HOUSE", exGst: 1500, invoices: 2 },
    { date: "2026-11-08", venue: "TEA_GARDEN", exGst: 700, invoices: 1 },
  ])
})

test("a refund line bigger than the sale stores 0, never negative revenue", () => {
  const rows = eventSalesByDay("Tarte Currumbin", [
    sale({ LineItems: [{ AccountCode: "41500", LineAmount: 100, TaxAmount: 10 }, { AccountCode: "41500", LineAmount: -220, TaxAmount: -20 }] }),
  ], CURRUMBIN_ACCOUNTS)
  assert.equal(rows[0].exGst, 0)
})

test("an org with no event account yields nothing", () => {
  const rows = eventSalesByDay("Tarte Bakery", [sale({ LineItems: [{ AccountCode: "41000", LineAmount: 1100, TaxAmount: 100 }] })], [{ Code: "41000", Name: "Sales" }])
  assert.deepEqual(rows, [])
})
