import { test } from "node:test"
import assert from "node:assert/strict"
import {
  looksLikeStatement,
  looksLikeCreditNote,
  negateCreditNoteAmounts,
  countPdfPages,
  type ParsedInvoice,
  type ParsedLineItem,
} from "./parser"

function line(overrides: Partial<ParsedLineItem> = {}): ParsedLineItem {
  return {
    description: "BUTTER SALTED ANCHOR 5kg",
    productCode: null,
    quantity: 2,
    unit: "BLK",
    unitPrice: 83.48,
    totalPrice: 166.96,
    gst: 0,
    ...overrides,
  }
}

function doc(overrides: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    documentType: "INVOICE",
    supplierName: "Bidfood Gold Coast",
    supplierAbn: null,
    invoiceNumber: "I71183386",
    invoiceDate: "2026-09-21",
    deliveryAddress: null,
    billTo: "Tarte Pty Ltd, Burleigh Heads",
    lineItems: [line()],
    subtotal: 166.96,
    gst: 0,
    total: 166.96,
    ...overrides,
  }
}

// ---------------------------------------------------------------- statements

test("looksLikeStatement: model verdict or Provedores month-label number", () => {
  assert.equal(looksLikeStatement(doc({ documentType: "STATEMENT" })), true)
  assert.equal(looksLikeStatement(doc({ invoiceNumber: "MAY 2026" })), true)
  assert.equal(looksLikeStatement(doc({ invoiceNumber: "  Sept 2026 " })), true)
  assert.equal(looksLikeStatement(doc({ invoiceNumber: "august 2026" })), true)
})

test("looksLikeStatement: ordinary invoice numbers are not statements", () => {
  assert.equal(looksLikeStatement(doc()), false)
  assert.equal(looksLikeStatement(doc({ invoiceNumber: null })), false)
  assert.equal(looksLikeStatement(doc({ invoiceNumber: "May 2026 Statement" })), false) // anchored
  assert.equal(looksLikeStatement(doc({ invoiceNumber: "2026-05" })), false)
  assert.equal(looksLikeStatement(doc({ invoiceNumber: "MAY" })), false)
})

// ---------------------------------------------------------------- credit notes

test("looksLikeCreditNote: model verdict or CM/CN/CRD prefixed numbers", () => {
  assert.equal(looksLikeCreditNote(doc({ documentType: "CREDIT_NOTE" })), true)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CM-014081" })), true)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CN306" })), true) // Pixel Bakehouse
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "crd 12" })), true)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CN.5" })), true)
})

test("looksLikeCreditNote: Global Food & Wine CMBR- numbers are credits", () => {
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CMBR-014081" })), true)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CMXY-014081" })), false, "only the GFW prefix, not any letters after CM")
})

test("looksLikeCreditNote: Bidfood C<digits>.<branch> only with the branch suffix", () => {
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "C7139711.GOL" })), true)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "c7139711.gol" })), true)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "C7139711" })), false)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "C1234.GOL" })), false) // too few digits
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "C7139711.GOLD" })), false)
})

test("looksLikeCreditNote: real invoice numbers that merely start with C are not credits", () => {
  assert.equal(looksLikeCreditNote(doc()), false)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CNR12345" })), false) // Marrow branch code
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "CH434300" })), false)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "C1234" })), false)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: null })), false)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "" })), false)
  assert.equal(looksLikeCreditNote(doc({ invoiceNumber: "   " })), false)
})

// ---------------------------------------------------------------- negation

test("negateCreditNoteAmounts: GFW-style positive credit becomes negative, unitPrice stays a rate", () => {
  const d = doc({
    documentType: "CREDIT_NOTE",
    invoiceNumber: "CMBR-014081",
    lineItems: [line({ description: "Slipper Bug Meat Raw [10-50g] 1kg", quantity: 2, unit: "kg", unitPrice: 64.5, totalPrice: 129.0, gst: 0 })],
    subtotal: 129.0,
    gst: 0,
    total: 129.0,
  })
  assert.equal(negateCreditNoteAmounts(d), true)
  assert.equal(d.total, -129.0)
  assert.equal(d.subtotal, -129.0)
  assert.equal(d.lineItems[0].totalPrice, -129.0)
  assert.equal(d.lineItems[0].quantity, -2)
  assert.equal(d.lineItems[0].unitPrice, 64.5)
})

test("negateCreditNoteAmounts: Provedores-style already-negative credit is left alone", () => {
  const d = doc({
    documentType: "CREDIT_NOTE",
    supplierName: "The Provedores",
    lineItems: [line({ description: "CAPSICUM RED KG", quantity: -3, unit: "kg", unitPrice: 6.3, totalPrice: -18.9, gst: 0 })],
    subtotal: -18.9,
    gst: 0,
    total: -18.9,
  })
  assert.equal(negateCreditNoteAmounts(d), false)
  assert.equal(d.total, -18.9)
  assert.equal(d.lineItems[0].totalPrice, -18.9)
  assert.equal(d.lineItems[0].quantity, -3)
  assert.equal(d.lineItems[0].unitPrice, 6.3)
})

test("negateCreditNoteAmounts: mixed signs are all forced negative, flagged as changed", () => {
  const d = doc({
    documentType: "CREDIT_NOTE",
    lineItems: [
      line({ quantity: -1, totalPrice: -10, unitPrice: 10 }),
      line({ quantity: 1, totalPrice: 10, unitPrice: -10 }), // extractor flipped the rate instead
    ],
    subtotal: -20,
    gst: -2,
    total: -22,
  })
  assert.equal(negateCreditNoteAmounts(d), true)
  assert.deepEqual(d.lineItems.map((l) => l.totalPrice), [-10, -10])
  assert.deepEqual(d.lineItems.map((l) => l.unitPrice), [10, 10])
  assert.equal(d.gst, -2)
})

test("negateCreditNoteAmounts: null header fields stay null, missing line fields become 0", () => {
  const d = doc({
    documentType: "CREDIT_NOTE",
    subtotal: null,
    gst: null,
    total: null,
    lineItems: [
      { description: "", productCode: null, quantity: null as unknown as number, unit: "", unitPrice: null as unknown as number, totalPrice: null as unknown as number, gst: null as unknown as number },
    ],
  })
  assert.equal(negateCreditNoteAmounts(d), false)
  assert.equal(d.total, null)
  assert.equal(d.subtotal, null)
  assert.equal(d.gst, null)
  assert.equal(d.lineItems[0].totalPrice, 0)
  assert.equal(d.lineItems[0].quantity, 0)
  assert.equal(d.lineItems[0].unitPrice, 0)
})

test("negateCreditNoteAmounts: empty line list, positive total", () => {
  const d = doc({ documentType: "CREDIT_NOTE", lineItems: [], subtotal: 50, gst: 5, total: 55 })
  assert.equal(negateCreditNoteAmounts(d), true)
  assert.equal(d.total, -55)
  assert.equal(d.gst, -5)
})

// ---------------------------------------------------------------- page count

test("countPdfPages: counts /Type /Page objects, not the /Pages tree", () => {
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj << /Type /Pages /Kids [2 0 R 3 0 R] /Count 2 >> endobj\n" +
      "2 0 obj << /Type /Page /Parent 1 0 R >> endobj\n" +
      "3 0 obj <</Type/Page/Parent 1 0 R>> endobj\n"
  )
  assert.equal(countPdfPages(pdf), 2)
})

test("countPdfPages: empty or non-PDF buffers are 0", () => {
  assert.equal(countPdfPages(Buffer.from("")), 0)
  assert.equal(countPdfPages(Buffer.from("hello world")), 0)
})
