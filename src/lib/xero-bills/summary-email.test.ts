import { test } from "node:test"
import assert from "node:assert/strict"
import { summaryCsv, summaryHtml, summaryLines, summarySubject, summaryText } from "./summary-email"
import type { RunSummary } from "./run"
import { matchPrivateSentSubject } from "../gmail/sent-tidy-rules"

// Made-up suppliers and figures only: this repo is public.
const S: RunSummary = {
  live: true,
  cutoff: "2026-11-04",
  capPerOrg: 60,
  attachmentsGranted: false,
  drafted: { "Tarte Bakery": 2, "Tarte Currumbin": 1 },
  draftedTotal: { "Tarte Bakery": 330, "Tarte Currumbin": 50 },
  drafts: [
    { invoiceId: "a", notes: ["twin in Tarte Currumbin: W-2 has the same date and total"], org: "Tarte Bakery", supplier: "Broad Wholesale", number: "W-1", date: "2026-11-05", total: 220, contact: "Broad Wholesale", lines: [{ account: "520", tax: "INPUT", amount: 72.5 }, { account: "501", tax: "EXEMPTEXPENSES", amount: 127.5 }], split: true, resplit: true, xeroInvoiceId: "x1" },
    { invoiceId: "b", notes: [], org: "Tarte Bakery", supplier: "Sunny Flour <Mills>", number: "F-2", date: "2026-11-05", total: 110, contact: "Sunny Flour Mills", lines: [{ account: "311", tax: "INPUT", amount: 100 }], split: false, resplit: false, xeroInvoiceId: "x2" },
    { invoiceId: "c", notes: [], org: "Tarte Currumbin", supplier: "Hilltop Dairy", number: "D-9", date: "2026-11-06", total: 50, contact: "Hilltop Dairy", lines: [{ account: "312", tax: "EXEMPTEXPENSES", amount: 50 }], split: false, resplit: false, xeroInvoiceId: "x3" },
  ],
  holds: [{ invoiceId: "h", org: "Tarte Bakery", supplierName: "Sunrise Eggs", invoiceNumber: "290275", invoiceDate: "2026-11-09", total: 40, reason: "date suspect: number 290275 is below most of this supplier's numbers" }],
  skipped: [],
  stopped: [{ org: "Tarte Currumbin", invoiceId: "z", error: "Xero 422: account code is archived" }],
  attachFailures: [],
  resplitSuppliers: ["Broad Wholesale"],
}

test("the summary is a few plain lines, headlines first, the detail in the attachment", () => {
  const lines = summaryLines(S)
  assert.equal(lines[0], "Kitchen put 3 DRAFT bills into Xero from supplier invoices dated Wed 4 Nov on: Bakery 2 ($330.00), Currumbin 1 ($50.00). None is approved; the morning bill check approves the clean ones.")
  assert.equal(lines[1], "1 held for a person, each with the reason, in the attached file.")
  assert.match(lines[2], /^Re-split by line before approving: Broad Wholesale\./)
  assert.equal(lines[3], "1 has a twin at the other venue (same day and total, another number), noted in the file.")
  assert.match(lines[4], /each draft links to the invoice PDF in Kitchen/)
  assert.equal(lines[5], "Currumbin stopped early on one invoice: Xero 422: account code is archived")
  assert.ok(summaryText(S).split("\n").length <= 12)
  const dry = summaryLines({ ...S, live: false })
  assert.match(dry[0], /^Dry run, nothing written to Xero: 3 bills would be drafted/)
})

test("subject is on the accounts@ private Sent list, so its Sent copy is trashed", () => {
  const subject = summarySubject(S, "2026-11-13")
  assert.equal(subject, "Kitchen draft bills, Fri 13 Nov: 2 Bakery, 1 Currumbin drafted, 1 held")
  assert.ok(matchPrivateSentSubject(subject))
})

test("the CSV has a row per draft, hold and stop, quoting safely; the html escapes; nothing has an em dash", () => {
  const csv = summaryCsv(S)
  const rows = csv.trim().split("\r\n")
  assert.equal(rows.length, 1 + 3 + 1 + 1)
  assert.equal(rows[0], "Result,Venue,Date,Supplier,Number,Total,Lines or reason,Notes,Xero bill")
  assert.equal(rows[1], "drafted,Bakery,2026-11-05,Broad Wholesale,W-1,220.00,520 INPUT 72.50; 501 EXEMPTEXPENSES 127.50,re-split by line; twin in Tarte Currumbin: W-2 has the same date and total,x1")
  assert.equal(rows[4], "held,Bakery,2026-11-09,Sunrise Eggs,290275,40.00,date suspect: number 290275 is below most of this supplier's numbers,,")
  const html = summaryHtml({ ...S, resplitSuppliers: ["Sunny Flour <Mills>"] })
  assert.ok(html.includes("Sunny Flour &lt;Mills&gt;"))
  assert.ok(!html.includes("<Mills>"))
  for (const t of [html, summaryText(S), csv, summarySubject(S, "2026-11-13")]) assert.ok(!t.includes("\u2014"))
})

test("CSV cells that a spreadsheet would run as a formula stay text", () => {
  const csv = summaryCsv({ ...S, holds: [{ ...S.holds[0], supplierName: "=HYPERLINK(\"x\")", total: -12.5 }] })
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`))
  assert.ok(csv.includes(",'-12.50,"))
})
