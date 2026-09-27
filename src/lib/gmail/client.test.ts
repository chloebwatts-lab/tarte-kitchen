import { test } from "node:test"
import assert from "node:assert/strict"
import {
  getHeader,
  extractPdfAttachments,
  extractPlainTextBody,
  extractSenderEmail,
  extractSenderName,
  getGmailRedirectUri,
} from "./client"

type Msg = Parameters<typeof getHeader>[0]

const b64url = (s: string) => Buffer.from(s, "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

function msg(from: string | null, parts?: Msg["payload"]["parts"], extra: Partial<Msg["payload"]> = {}): Msg {
  return {
    id: "abc",
    threadId: "t",
    internalDate: "0",
    payload: {
      headers: [
        ...(from !== null ? [{ name: "From", value: from }] : []),
        { name: "Subject", value: "Invoice I71183386" },
      ],
      parts,
      ...extra,
    },
  }
}

// ---------------------------------------------------------------- headers / sender

test("getHeader: case-insensitive name, undefined when absent", () => {
  const m = msg("Bidfood <accounts@bidfood.com.au>")
  assert.equal(getHeader(m, "subject"), "Invoice I71183386")
  assert.equal(getHeader(m, "FROM"), "Bidfood <accounts@bidfood.com.au>")
  assert.equal(getHeader(m, "X-Missing"), undefined)
})

test("extractSenderEmail: angle-bracket and bare forms, lowercased", () => {
  assert.equal(extractSenderEmail(msg("Bidfood Accounts <Accounts@Bidfood.com.au>")), "accounts@bidfood.com.au")
  assert.equal(extractSenderEmail(msg("  ORDERS@PROVEDORES.COM.AU  ")), "orders@provedores.com.au")
  assert.equal(extractSenderEmail(msg('"Accounts Receivable - Coastal Fresh" <messaging-service@post.xero.com>')), "messaging-service@post.xero.com")
  assert.equal(extractSenderEmail(msg(null)), null)
})

test("extractSenderName: display name with quotes stripped, null for bare addresses", () => {
  assert.equal(extractSenderName(msg('"Accounts Receivable - Coastal Fresh" <messaging-service@post.xero.com>')), "Accounts Receivable - Coastal Fresh")
  assert.equal(extractSenderName(msg("Bidfood Accounts <accounts@bidfood.com.au>")), "Bidfood Accounts")
  assert.equal(extractSenderName(msg("'Son of a Bunn' <hello@sonofabunn.com.au>")), "Son of a Bunn")
  assert.equal(extractSenderName(msg("orders@provedores.com.au")), null)
  assert.equal(extractSenderName(msg("<orders@provedores.com.au>")), null)
  assert.equal(extractSenderName(msg('"" <x@y.z>')), null)
  assert.equal(extractSenderName(msg(null)), null)
})

// ---------------------------------------------------------------- attachments

test("extractPdfAttachments: application/pdf and spreadsheet types, nested multiparts", () => {
  const m = msg("x <x@y.z>", [
    { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: "aGk" } }] },
    { mimeType: "application/pdf", filename: "I71183386.pdf", body: { attachmentId: "a1", size: 100 } },
    {
      mimeType: "multipart/mixed",
      parts: [
        { mimeType: "application/pdf", filename: "I71183387.pdf", body: { attachmentId: "a2" } },
        { mimeType: "application/vnd.ms-excel", filename: "eggs.xls", body: { attachmentId: "a3" } },
      ],
    },
  ])
  assert.deepEqual(extractPdfAttachments(m), [
    { attachmentId: "a1", filename: "I71183386.pdf", mimeType: "application/pdf" },
    { attachmentId: "a2", filename: "I71183387.pdf", mimeType: "application/pdf" },
    { attachmentId: "a3", filename: "eggs.xls", mimeType: "application/vnd.ms-excel" },
  ])
})

test("extractPdfAttachments: octet-stream trusted only with a .pdf/.xlsx filename", () => {
  const m = msg("x <x@y.z>", [
    { mimeType: "application/octet-stream", filename: "Provedores_INV_1234.PDF", body: { attachmentId: "p1" } },
    { mimeType: "application/octet-stream", filename: "report.xlsx", body: { attachmentId: "p2" } },
    { mimeType: "application/octet-stream", filename: "photo.jpg", body: { attachmentId: "p3" } },
    { mimeType: "application/octet-stream", body: { attachmentId: "p4" } },
  ])
  assert.deepEqual(extractPdfAttachments(m).map((a) => a.attachmentId), ["p1", "p2"])
})

test("extractPdfAttachments: inline parts without attachmentId, images and missing parts are ignored", () => {
  const m = msg("x <x@y.z>", [
    { mimeType: "application/pdf", filename: "inline.pdf", body: { data: "JVBERi0=" } },
    { mimeType: "image/png", filename: "logo.png", body: { attachmentId: "i1" } },
    { filename: "no-mime.pdf", body: { attachmentId: "i2" } },
  ])
  assert.deepEqual(extractPdfAttachments(m), [])
  assert.deepEqual(extractPdfAttachments(msg("x <x@y.z>")), [])
})

test("extractPdfAttachments: empty filename falls back to invoice.pdf", () => {
  const m = msg("x <x@y.z>", [{ mimeType: "application/pdf", filename: "", body: { attachmentId: "a1" } }])
  assert.equal(extractPdfAttachments(m)[0].filename, "invoice.pdf")
})

// ---------------------------------------------------------------- body

test("extractPlainTextBody: prefers text/plain, decodes base64url", () => {
  const text = "Booking for 12 at 10:30am\nHigh tea x 12 — $780"
  const m = msg("x <x@y.z>", [
    { mimeType: "text/html", body: { data: b64url("<p>ignored</p>") } },
    { mimeType: "text/plain", body: { data: b64url(text) } },
  ])
  assert.equal(extractPlainTextBody(m), text)
})

test("extractPlainTextBody: falls back to stripped HTML with entities decoded", () => {
  const html = "<html><head><style>p{}</style></head><body><div>Order &amp; pay</div><p>Table 4<br>Tea &lt;garden&gt;</p><script>x()</script></body></html>"
  const m = msg("x <x@y.z>", [{ mimeType: "text/html", body: { data: b64url(html) } }])
  const out = extractPlainTextBody(m)
  assert.match(out, /Order & pay/)
  assert.match(out, /Table 4\nTea <garden>/)
  assert.doesNotMatch(out, /p\{\}|x\(\)|<\/?(p|div|html|body|style|script)\b/)
})

test("extractPlainTextBody: top-level body without parts, and empty message", () => {
  const m = msg("x <x@y.z>", undefined, { mimeType: "text/plain", body: { data: b64url("hi there") } })
  assert.equal(extractPlainTextBody(m), "hi there")
  assert.equal(extractPlainTextBody(msg("x <x@y.z>")), "")
})

test("getGmailRedirectUri: production default when env unset", () => {
  const prev = process.env.GMAIL_REDIRECT_URI
  delete process.env.GMAIL_REDIRECT_URI
  try {
    assert.equal(getGmailRedirectUri(), "https://kitchen.tarte.com.au/api/gmail/callback")
    process.env.GMAIL_REDIRECT_URI = "http://localhost:3000/cb"
    assert.equal(getGmailRedirectUri(), "http://localhost:3000/cb")
  } finally {
    if (prev === undefined) delete process.env.GMAIL_REDIRECT_URI
    else process.env.GMAIL_REDIRECT_URI = prev
  }
})
