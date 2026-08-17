import Anthropic from "@anthropic-ai/sdk"

export interface ParsedLineItem {
  description: string
  productCode: string | null
  quantity: number
  unit: string
  unitPrice: number
  totalPrice: number
  gst: number
}

export type ParsedDocumentType =
  | "INVOICE"
  | "STATEMENT"
  | "ORDER_CONFIRMATION"
  | "CREDIT_NOTE"

export interface ParsedInvoice {
  /** What kind of document this is, a delivery invoice vs a monthly
   * statement-of-account vs a pre-delivery order confirmation. Statements
   * and order confirmations get stored but excluded from spend totals so
   * they don't double-count the deliveries they summarise/precede. */
  documentType: ParsedDocumentType
  /** True when the document is a credit note whose amounts were printed as
   * positive magnitudes and had to be negated during normalisation. Purely
   * diagnostic, the amounts on this object are already signed correctly. */
  creditNoteNegated?: boolean
  /** True when line items were deliberately skipped because the document
   * blew the extraction output budget (header-only re-extract). A
   * non-statement with this flag must NOT be treated as fully processed,
   * its line detail is missing, not empty. */
  lineItemsTruncated?: boolean
  /** Rough page count from the raw PDF, for triage notes. */
  pageCount?: number
  supplierName: string
  supplierAbn: string | null
  invoiceNumber: string | null
  invoiceDate: string | null // YYYY-MM-DD
  deliveryAddress: string | null // "Ship To" / "Deliver To", used to infer venue
  billTo: string | null // "Bill To" / "Account" / customer block, who is charged; also used to infer venue
  lineItems: ParsedLineItem[]
  subtotal: number | null
  gst: number | null
  total: number | null
}

const EXTRACTION_PROMPT = `Extract all line items from this Australian supplier document.
Return valid JSON only, no other text or markdown fences:
{
  "documentType": "INVOICE" or "STATEMENT" or "ORDER_CONFIRMATION" or "CREDIT_NOTE",
  "supplierName": "string",
  "supplierAbn": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null (these are Australian invoices, dates on the page are DD/MM/YYYY, so 6/05/2026 means 6 May 2026, NOT 5 June 2026)",
  "deliveryAddress": "the Ship To / Deliver To address block as a single line, or null",
  "billTo": "the Bill To / Account / Invoice To / Customer name-and-address block as a single line, this is the entity being charged, NOT the supplier's own letterhead. It usually names the Tarte venue (e.g. 'Tarte Beach House', 'Tarte Currumbin Pty Ltd', 'Tarte Burleigh'). Return null if absent.",
  "lineItems": [
    {
      "description": "exact product name as on invoice",
      "productCode": "supplier SKU/code if shown, null otherwise",
      "quantity": number,
      "unit": "kg/L/ea/pack/case/bag/tray/bunch/dozen/carton/etc",
      "unitPrice": number,
      "totalPrice": number,
      "gst": number
    }
  ],
  "subtotal": number or null,
  "gst": number or null,
  "total": number or null
}

documentType rules:
- "STATEMENT" if this is a Statement of Account / monthly statement that lists multiple
  prior invoices (each row references an invoice number or receipt rather than a product)
  with a closing balance. Signals: title says "Statement", invoice number is a month label
  like "MAY 2026", line items look like "INVOICE CH434300" / "RECEIPT 8473332" /
  "CREDIT NOTE …" rather than products. ALSO use "STATEMENT" for payment receipts and
  remittance advices, documents confirming payment of prior orders/invoices (signals:
  "Payment Surcharge", "Receipt", rows like "Delivery Order: #6790" or "Sale; <customer>"
  instead of products). They summarise spend already invoiced elsewhere.
- "ORDER_CONFIRMATION" if this is a pre-delivery order confirmation, quote or pro-forma,
  NOT a bill. Signals: the text "THIS IS NOT AN INVOICE", "INDICATIVE TOTAL",
  "ESTIMATED TOTAL", a "Order:" / "Order Number" reference with no "Tax Invoice" title,
  wording like "final products, prices and quantities may vary", ordering-platform footers
  (e.g. fresho.com). These share their order reference with the real tax invoice that
  follows, so misclassifying one as INVOICE double-counts the order.
- "CREDIT_NOTE" if the WHOLE document is a credit note / adjustment note reversing goods,
  i.e. money coming back to the customer, not a bill. Signals: the title or a header block
  says "Credit Note", "Adjustment Note", "Credit Memo" or "RCTI Credit"; the document
  number starts with CM / CN / CRD (e.g. "CMBR-014081", "CN306"); there is a "PO Number"
  or "Against Invoice" field pointing at a DIFFERENT invoice number that this document
  reverses. Note the amounts are often printed as plain positive numbers with no minus
  sign, that does NOT make it an invoice. Do not confuse this with a STATEMENT that merely
  LISTS a "CREDIT NOTE ..." row among many other rows, a CREDIT_NOTE document credits
  specific products and usually has just one or two product lines.
- "INVOICE" otherwise, a single delivery invoice listing products purchased. A document
  titled "Tax Invoice" is an INVOICE even when it was generated by an ordering platform.
  Still extract lineItems for STATEMENT and ORDER_CONFIRMATION documents when present.

Other rules:
- Report every amount exactly as printed on the page, including a minus sign when the page
  shows one. Do NOT add or remove minus signs to make a credit note "look right", the sign
  is normalised downstream.
- Prices should be ex GST where possible. If prices are inc GST, divide by 1.1 to get ex GST.
- Include EVERY line item, even delivery fees or credits.
- Use the exact product description from the invoice, don't shorten or paraphrase.
- If unit is ambiguous, note what the invoice shows (e.g. "5kg bag" → unit: "bag", not "kg").
- supplierName is the company that ISSUED the invoice (letterhead / "From"). It may itself contain a suburb (e.g. "Bidfood Gold Coast (Burleigh Marr Distribution)"), do NOT treat that as the customer venue. The venue lives in billTo / deliveryAddress only.
- If a field cannot be determined, use null.`

/** Heuristic backstop in case the model misclassifies a statement.
 * Currently catches Provedores-style "MAY 2026" invoiceNumbers, the only
 * pattern we've seen in prod so far. Keep tight to avoid false positives. */
const STATEMENT_INVOICE_NUMBER_RE =
  /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t|tember)?|oct(ober)?|nov(ember)?|dec(ember)?)\s+\d{4}$/i

export function looksLikeStatement(parsed: ParsedInvoice): boolean {
  if (parsed.documentType === "STATEMENT") return true
  if (
    parsed.invoiceNumber &&
    STATEMENT_INVOICE_NUMBER_RE.test(parsed.invoiceNumber.trim())
  ) {
    return true
  }
  return false
}

/** Credit-note document numbers seen in prod: Global Food & Wine
 * "CMBR-014081", Pixel Bakehouse "CN306". Anchored on a CM/CN/CRD prefix
 * followed by a digit or separator so real invoice numbers that merely start
 * with those letters (e.g. Marrow's "CNR..." branch codes) don't get swept
 * in. */
const CREDIT_NOTE_NUMBER_RE = /^(cm|cn|crd)[-\s.]?\d/i

/** Bidfood is the awkward one: it numbers credit notes "C7139711.GOL" and
 * invoices "I71183386", i.e. the only difference is the leading letter, and
 * the branch suffix (.GOL = Gold Coast) is what makes the C-prefix specific
 * enough to match on. Kept separate from the rule above so a plain "C1234"
 * from some other supplier is NOT treated as a credit. */
const BIDFOOD_CREDIT_NOTE_RE = /^c\d{5,}\.[a-z]{3}$/i

export function looksLikeCreditNote(parsed: ParsedInvoice): boolean {
  if (parsed.documentType === "CREDIT_NOTE") return true
  const num = parsed.invoiceNumber?.trim()
  if (!num) return false
  return CREDIT_NOTE_NUMBER_RE.test(num) || BIDFOOD_CREDIT_NOTE_RE.test(num)
}

/** Force every monetary field on a credit note to a negative magnitude.
 *
 * Suppliers are split on how they print credits: Jensens and The Provedores
 * send "-$106.02", while Global Food & Wine, Cheese Time and Pixel Bread
 * print "$1,734.00" with the word "Credit Note" only in the page title. Both
 * shapes must land in the DB the same way, so take -abs() rather than
 * flipping the sign, which would turn an already-negative credit positive.
 *
 * Quantities are negated alongside the totals (a 2-box credit is -2 boxes)
 * so stocktake and par-level sums net correctly. unitPrice stays POSITIVE:
 * it is a rate, not an amount, and the price-alert comparison in units.ts
 * reads it directly. */
export function negateCreditNoteAmounts(parsed: ParsedInvoice): boolean {
  const neg = (n: number | null | undefined): number | null =>
    n == null ? null : -Math.abs(n)

  let changed =
    (parsed.total != null && parsed.total > 0) ||
    (parsed.subtotal != null && parsed.subtotal > 0) ||
    parsed.lineItems.some((l) => (l.totalPrice ?? 0) > 0)

  parsed.subtotal = neg(parsed.subtotal)
  parsed.gst = neg(parsed.gst)
  parsed.total = neg(parsed.total)
  for (const line of parsed.lineItems) {
    line.totalPrice = neg(line.totalPrice) ?? 0
    line.quantity = neg(line.quantity) ?? 0
    line.gst = neg(line.gst) ?? 0
    line.unitPrice = Math.abs(line.unitPrice ?? 0)
  }
  return changed
}

// Header-only fallback for documents whose line items overflow the output
// budget (e.g. Bidfood's monthly statements list a whole month of rows).
// Totals and classification still come through; line detail is skipped.
// Callers must treat a non-statement result as INCOMPLETE (lineItemsTruncated
// is set), a genuine long delivery invoice re-extracted this way has lost
// all its line detail and needs review, not a "fully processed" status.
const HEADER_ONLY_PROMPT = `${EXTRACTION_PROMPT}

OVERRIDE: this document is too long to list line items. Return "lineItems": [] and fill in ONLY the header fields (documentType, supplierName, supplierAbn, invoiceNumber, invoiceDate, deliveryAddress, billTo, subtotal, gst, total). Classify documentType carefully, a long document is often a STATEMENT, but a multi-page delivery invoice with many product rows is still an INVOICE.`

/** Rough page count from the raw PDF bytes, counts page objects. Used only
 * for triage notes and statement-vs-long-invoice heuristics, so "roughly
 * right" is fine. */
export function countPdfPages(pdfBuffer: Buffer): number {
  const matches = pdfBuffer
    .toString("latin1")
    .match(/\/Type\s*\/Page[^s]/g)
  return matches ? matches.length : 0
}

export async function parseInvoicePdf(pdfBuffer: Buffer): Promise<ParsedInvoice> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const callExtractor = (prompt: string, maxTokens: number) =>
    client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      // Force pure JSON output: a system prompt + an assistant prefill of
      // "{" together stop Sonnet from emitting "Looking at this invoice..."
      // style preambles that break JSON.parse.
      system:
        "You are a strict JSON extractor. Output ONLY a single JSON object, no preamble, no commentary, no markdown fences. Your entire response must be valid JSON that can be passed directly to JSON.parse.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBuffer.toString("base64"),
              },
            },
            {
              type: "text",
              text: prompt,
            },
          ],
        },
      ],
    })

  let response = await callExtractor(EXTRACTION_PROMPT, 16384)
  let lineItemsTruncated = false
  if (response.stop_reason === "max_tokens") {
    // Output truncated mid-JSON, unparseable. Re-extract headers only so
    // month-long statements classify as STATEMENT instead of erroring on
    // every sweep. The flag tells the processor that a non-statement result
    // is missing its line detail (a long delivery invoice, not an empty one).
    lineItemsTruncated = true
    response = await callExtractor(HEADER_ONLY_PROMPT, 4096)
  }

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API")
  }

  // Sonnet 4.6 rejects assistant-message prefill; rely on the system
  // prompt + outermost-brace extraction below.
  let jsonStr = textBlock.text.trim()
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
  }
  if (!jsonStr.startsWith("{")) {
    const first = jsonStr.indexOf("{")
    const last = jsonStr.lastIndexOf("}")
    if (first >= 0 && last > first) {
      jsonStr = jsonStr.slice(first, last + 1)
    }
  }

  const parsed = JSON.parse(jsonStr) as ParsedInvoice

  // Basic validation
  if (!Array.isArray(parsed.lineItems)) {
    throw new Error("Invalid parse result: lineItems is not an array")
  }

  // Default documentType for older callers / unexpected responses, then
  // run the heuristic backstop to catch statements the model misclassified.
  if (
    parsed.documentType !== "STATEMENT" &&
    parsed.documentType !== "INVOICE" &&
    parsed.documentType !== "ORDER_CONFIRMATION" &&
    parsed.documentType !== "CREDIT_NOTE"
  ) {
    parsed.documentType = "INVOICE"
  }
  if (parsed.documentType === "INVOICE" && looksLikeStatement(parsed)) {
    parsed.documentType = "STATEMENT"
  }
  // Credit-note backstop runs AFTER the statement one: a document whose
  // number matches CM/CN/CRD is a credit note even if the model called it a
  // plain invoice, which is exactly how Global Food & Wine's credits slipped
  // through as positive spend. Statements are left alone, they legitimately
  // list credit-note rows without being one.
  if (parsed.documentType === "INVOICE" && looksLikeCreditNote(parsed)) {
    parsed.documentType = "CREDIT_NOTE"
  }
  if (parsed.documentType === "CREDIT_NOTE") {
    parsed.creditNoteNegated = negateCreditNoteAmounts(parsed)
  }

  parsed.lineItemsTruncated = lineItemsTruncated
  parsed.pageCount = countPdfPages(pdfBuffer)

  return parsed
}
