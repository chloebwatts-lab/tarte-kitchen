import { test } from "node:test"
import assert from "node:assert/strict"
import {
  sanitiseInvoiceDate,
  aestYmd,
  INVOICE_DATE_MAX_DAYS_BEFORE_EMAIL,
  INVOICE_DATE_MAX_DAYS_AFTER_EMAIL,
} from "./invoice-date"

// Cookers 10224572 arrived 2026-10-07 23:00 UTC = 09:00 AEST on 8 Oct 2026.
const cookersEmail = new Date("2026-10-07T23:00:07Z")

test("aestYmd: a late-UTC email lands on the next AEST calendar day", () => {
  assert.equal(aestYmd(cookersEmail), "2026-10-08")
  assert.equal(aestYmd(new Date("2026-10-08T13:59:59Z")), "2026-10-08")
  assert.equal(aestYmd(new Date("2026-10-08T14:00:00Z")), "2026-10-09")
})

test("the Cookers 2008 misread is replaced by the email date with a note", () => {
  const r = sanitiseInvoiceDate("2008-10-26", cookersEmail)
  assert.equal(r.adjusted, true)
  assert.equal(r.date?.toISOString(), "2026-10-08T00:00:00.000Z")
  assert.match(r.note ?? "", /2008-10-26/)
  assert.match(r.note ?? "", /2026-10-08/)
})

test("a date a few days either side of the email is kept as parsed", () => {
  for (const d of ["2026-10-08", "2026-10-06", "2026-10-01", "2026-10-15"]) {
    const r = sanitiseInvoiceDate(d, cookersEmail)
    assert.equal(r.adjusted, false, d)
    assert.equal(r.date?.toISOString(), `${d}T00:00:00.000Z`)
    assert.equal(r.note, null)
  }
})

test("window edges: 60 days before and 7 days after are inside, one more day is out", () => {
  // email AEST day is 2026-10-08
  assert.equal(sanitiseInvoiceDate("2026-08-09", cookersEmail).adjusted, false) // -60
  assert.equal(sanitiseInvoiceDate("2026-08-08", cookersEmail).adjusted, true) // -61
  assert.equal(sanitiseInvoiceDate("2026-10-15", cookersEmail).adjusted, false) // +7
  assert.equal(sanitiseInvoiceDate("2026-10-16", cookersEmail).adjusted, true) // +8
})

test("a DD/MM swap that lands months ahead (Provedores CH640314 read as 10 Dec) is pulled back", () => {
  const r = sanitiseInvoiceDate("2026-12-10", new Date("2026-10-12T02:00:30Z"))
  assert.equal(r.adjusted, true)
  assert.equal(r.date?.toISOString(), "2026-10-12T00:00:00.000Z")
})

test("missing and garbage dates", () => {
  assert.deepEqual(sanitiseInvoiceDate(null, cookersEmail), { date: null, adjusted: false, note: null })
  assert.deepEqual(sanitiseInvoiceDate("", cookersEmail), { date: null, adjusted: false, note: null })
  const r = sanitiseInvoiceDate("not-a-date", cookersEmail)
  assert.equal(r.adjusted, true)
  assert.equal(r.date?.toISOString(), "2026-10-08T00:00:00.000Z")
})

test("the note says how far off the read was, in the right direction", () => {
  // email AEST day is 2026-10-08; 1 Jul is 99 days earlier, 20 Oct is 12 later
  const before = sanitiseInvoiceDate("2026-07-01", cookersEmail)
  assert.equal(before.adjusted, true)
  assert.match(before.note ?? "", /99 days before/)
  const after = sanitiseInvoiceDate("2026-10-20", cookersEmail)
  assert.equal(after.adjusted, true)
  assert.match(after.note ?? "", /12 days after/)
  assert.match(sanitiseInvoiceDate("2008-10-26", cookersEmail).note ?? "", /days before/)
})

test("the window is measured from the email's AEST day, not its UTC day", () => {
  // 14:00 UTC on 7 Oct is midnight AEST on 8 Oct: +7 from 8 Oct is 15 Oct, still inside
  const atAestMidnight = new Date("2026-10-07T14:00:00Z")
  assert.equal(aestYmd(atAestMidnight), "2026-10-08")
  assert.equal(sanitiseInvoiceDate("2026-10-15", atAestMidnight).adjusted, false)
  // one second earlier the email is still 7 Oct AEST, so 15 Oct is +8 and out,
  // and the substituted date is the AEST day (7 Oct), not the UTC-shifted one
  const justBefore = new Date("2026-10-07T13:59:59Z")
  const r = sanitiseInvoiceDate("2026-10-15", justBefore)
  assert.equal(r.adjusted, true)
  assert.equal(r.date?.toISOString(), "2026-10-07T00:00:00.000Z")
})

test("stored dates are always UTC midnight of a calendar day (matches the @db.Date column)", () => {
  for (const d of ["2026-10-08", "2026-08-09", "2026-10-15"]) {
    const kept = sanitiseInvoiceDate(d, cookersEmail)
    assert.equal(kept.date?.toISOString().slice(10), "T00:00:00.000Z")
  }
  const swapped = sanitiseInvoiceDate("2027-01-01", cookersEmail)
  assert.equal(swapped.date?.toISOString(), "2026-10-08T00:00:00.000Z")
})

test("rescue re-parse: measured against the row's createdAt, an overdue re-send inside 60 days is kept", () => {
  // row created 30 Sep 2026 14:12 AEST, invoice genuinely dated 1 Sep (29 days earlier)
  const createdAt = new Date("2026-09-30T04:12:00Z")
  const r = sanitiseInvoiceDate("2026-09-01", createdAt)
  assert.equal(r.adjusted, false)
  assert.equal(r.date?.toISOString(), "2026-09-01T00:00:00.000Z")
  // but a row created today that re-parses to a date from last year is still caught
  const old = sanitiseInvoiceDate("2025-09-01", createdAt)
  assert.equal(old.adjusted, true)
  assert.equal(old.date?.toISOString(), "2026-09-30T00:00:00.000Z")
})

test("constants: the window is 60 days back and 7 days forward", () => {
  assert.equal(INVOICE_DATE_MAX_DAYS_BEFORE_EMAIL, 60)
  assert.equal(INVOICE_DATE_MAX_DAYS_AFTER_EMAIL, 7)
})
