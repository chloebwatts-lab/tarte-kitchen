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

export interface ParsedInvoice {
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

const EXTRACTION_PROMPT = `Extract all line items from this Australian supplier invoice.
Return valid JSON only, no other text or markdown fences:
{
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

Important:
- Prices should be ex GST where possible. If prices are inc GST, divide by 1.1 to get ex GST.
- Include EVERY line item, even delivery fees or credits.
- Use the exact product description from the invoice — don't shorten or paraphrase.
- If unit is ambiguous, note what the invoice shows (e.g. "5kg bag" → unit: "bag", not "kg").
- If a field cannot be determined, use null.`

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
      { role: "assistant", content: "{" },
    ],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API")
  }

  // Re-prepend the brace we prefilled, then defensively strip fences and
  // recover from any leaked preamble by slicing the outermost {...}.
  let jsonStr = ("{" + textBlock.text).trim()
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

  return parsed
}
