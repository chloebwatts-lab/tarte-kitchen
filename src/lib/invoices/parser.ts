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

export type ParsedDocumentType = "INVOICE" | "STATEMENT"

export interface ParsedInvoice {
  /** What kind of document this is — a delivery invoice vs a monthly
   * statement-of-account. Statements get stored but excluded from spend
   * totals so they don't double-count the deliveries they summarise. */
  documentType: ParsedDocumentType
  supplierName: string
  supplierAbn: string | null
  invoiceNumber: string | null
  invoiceDate: string | null // YYYY-MM-DD
  deliveryAddress: string | null // "Ship To" / "Deliver To" — used to infer venue
  lineItems: ParsedLineItem[]
  subtotal: number | null
  gst: number | null
  total: number | null
}

const EXTRACTION_PROMPT = `Extract all line items from this Australian supplier document.
Return valid JSON only, no other text or markdown fences:
{
  "documentType": "INVOICE" or "STATEMENT",
  "supplierName": "string",
  "supplierAbn": "string or null",
  "invoiceNumber": "string or null",
  "invoiceDate": "YYYY-MM-DD or null",
  "deliveryAddress": "the Ship To / Deliver To address block as a single line, or null",
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
  "CREDIT NOTE …" rather than products.
- "INVOICE" otherwise — a single delivery invoice listing products purchased.

Other rules:
- Prices should be ex GST where possible. If prices are inc GST, divide by 1.1 to get ex GST.
- Include EVERY line item, even delivery fees or credits.
- Use the exact product description from the invoice — don't shorten or paraphrase.
- If unit is ambiguous, note what the invoice shows (e.g. "5kg bag" → unit: "bag", not "kg").
- If a field cannot be determined, use null.`

/** Heuristic backstop in case the model misclassifies a statement.
 * Currently catches Provedores-style "MAY 2026" invoiceNumbers — the only
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

export async function parseInvoicePdf(pdfBuffer: Buffer): Promise<ParsedInvoice> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4096,
    // Force pure JSON output: a system prompt + an assistant prefill of
    // "{" together stop Sonnet from emitting "Looking at this invoice..."
    // style preambles that break JSON.parse.
    system:
      "You are a strict JSON extractor. Output ONLY a single JSON object — no preamble, no commentary, no markdown fences. Your entire response must be valid JSON that can be passed directly to JSON.parse.",
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
            text: EXTRACTION_PROMPT,
          },
        ],
      },
    ],
  })

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
  if (parsed.documentType !== "STATEMENT" && parsed.documentType !== "INVOICE") {
    parsed.documentType = "INVOICE"
  }
  if (looksLikeStatement(parsed)) parsed.documentType = "STATEMENT"

  return parsed
}
