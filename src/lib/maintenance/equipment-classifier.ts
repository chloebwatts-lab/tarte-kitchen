import Anthropic from "@anthropic-ai/sdk"
import { ASSET_CATEGORIES, CATEGORY_LABEL, type AssetCategory } from "@/lib/maintenance/constants"

/**
 * Classifies one email (subject + body + optional PDF attachments) as an
 * EQUIPMENT PURCHASE or not, and extracts the machine(s) bought. One invoice
 * can carry several machines (a fridge and a fryer on the same CKC order).
 *
 * Feeds the check-equipment-emails sweep, which turns each extracted item
 * into a MaintenanceAsset (needsReview) with a QR label ready to print.
 */

export interface ClassifiedEquipmentItem {
  venue: "BURLEIGH" | "BEACH_HOUSE"
  /** Staff-facing name, e.g. "Turbo Air underbench fridge". */
  name: string
  category: AssetCategory
  manufacturer: string | null
  model: string | null
  serial: string | null
  /** YYYY-MM-DD — invoice/order date. */
  purchaseDate: string
  priceExGst: number | null
  /** Who we bought it from (Commercial Kitchen Company, Nisbets, ...). */
  supplier: string | null
  warrantyMonths: number | null
  note: string | null
}

export interface EquipmentClassification {
  isEquipmentPurchase: boolean
  reason: string
  items: ClassifiedEquipmentItem[]
}

const CATEGORY_LIST = ASSET_CATEGORIES.map((c) => `- "${c}": ${CATEGORY_LABEL[c]}`).join("\n")

function buildPrompt(input: {
  subject: string
  from: string
  receivedDate: string
  bodyText: string
  assetHints: string
}): string {
  return `You are reading one email from a Gold Coast hospitality group's inbox. Decide whether it documents the PURCHASE OF NEW KITCHEN/VENUE EQUIPMENT for one of our two sites, and extract the machine(s) so they can be added to our maintenance register.

Our sites (venue values):
- "BURLEIGH": Tarte Bakery, 2 West Street, Burleigh Heads
- "BEACH_HOUSE": Tarte Beach House / Tarte Currumbin / Tea Garden / Tarte Market, 796-808 Pacific Parade, Currumbin (all Currumbin trading names are this ONE venue)
Pick the venue from the delivery address or account details. If genuinely undeterminable, pick the likelier venue and say so in the note.

Equipment categories:
${CATEGORY_LIST}

What counts (isEquipmentPurchase=true): a tax invoice, receipt or order confirmation for NEW (or replacement) plant/equipment we would maintain and might need repaired one day — fridges, freezers, ovens, dishwashers, fryers, cooktops, ice machines, coffee machines/grinders, mixers, blenders, juicers, display cabinets, cool rooms, and comparable powered appliances (including a vacuum, pie warmer or till-side appliance). Forwarded emails (Fwd:) count, read the forwarded content. Quotes count ONLY when the email confirms the order was placed/paid.

What does NOT count (isEquipmentPurchase=false): repairs, callouts, service visits or spare PARTS for existing machines; smallwares and consumables (pans, trays, containers, utensils, crockery, chemicals, packaging); food/beverage supplier invoices; furniture; unaccepted quotes and marketing emails; our own app's automated emails. Skip individual items under roughly $150 ex GST unless they are clearly a powered appliance we'd repair rather than replace.

Machines already on our register (do NOT re-extract these exact machines from statements or reminders about old invoices):
${input.assetHints || "(none)"}

Return ONLY valid JSON:
{
  "isEquipmentPurchase": boolean,
  "reason": "one short sentence",
  "items": [
    {
      "venue": "BURLEIGH" | "BEACH_HOUSE",
      "name": "short staff-facing name, brand + what it is (e.g. 'Turbo Air underbench fridge')",
      "category": "one of the category keys above",
      "manufacturer": "brand or null",
      "model": "model number or null",
      "serial": "serial number if stated (rare on invoices) or null",
      "purchaseDate": "YYYY-MM-DD invoice/order date (Australian emails: 6/05/2026 means 6 May 2026)",
      "priceExGst": number or null (this item's ex-GST price, divide inc-GST by 1.1),
      "supplier": "who we bought it from or null",
      "warrantyMonths": number or null (only if the document states a warranty period),
      "note": "short detail worth keeping (e.g. 'replaces the old juice bar freezer, delivery 12 Sep') or null"
    }
  ]
}
If isEquipmentPurchase is false, return "items": [].
One JSON item per physical machine: an invoice line "2x Skipio freezer" is TWO items (same details, note which is which if possible).

Email received: ${input.receivedDate}
From: ${input.from}
Subject: ${input.subject}

Body:
${input.bodyText.slice(0, 12000)}`
}

export async function classifyEquipmentEmail(input: {
  subject: string
  from: string
  receivedDate: string
  bodyText: string
  pdfAttachments: Buffer[]
  /** Recent register entries so statements/reminders don't re-create them. */
  assetHints: string
}): Promise<EquipmentClassification> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content: Anthropic.ContentBlockParam[] = []
  // Cap at 2 PDFs per email, mirroring the service-email classifier.
  for (const pdf of input.pdfAttachments.slice(0, 2)) {
    content.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: pdf.toString("base64"),
      },
    })
  }
  content.push({ type: "text", text: buildPrompt(input) })

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system:
      "You are a strict JSON extractor. Output ONLY a single JSON object, no preamble, no commentary, no markdown fences. Your entire response must be valid JSON that can be passed directly to JSON.parse.",
    messages: [{ role: "user", content }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("No text response from Claude API")
  }

  let jsonStr = textBlock.text.trim()
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "")
  }
  if (!jsonStr.startsWith("{")) {
    const first = jsonStr.indexOf("{")
    const last = jsonStr.lastIndexOf("}")
    if (first >= 0 && last > first) jsonStr = jsonStr.slice(first, last + 1)
  }

  const parsed = JSON.parse(jsonStr) as EquipmentClassification
  if (typeof parsed.isEquipmentPurchase !== "boolean" || !Array.isArray(parsed.items)) {
    throw new Error("Invalid classification shape")
  }
  // Drop malformed rows rather than failing the whole email.
  parsed.items = parsed.items.filter(
    (i) =>
      ["BURLEIGH", "BEACH_HOUSE"].includes(i.venue) &&
      typeof i.name === "string" &&
      i.name.trim().length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(i.purchaseDate ?? "")
  )
  for (const i of parsed.items) {
    if (!ASSET_CATEGORIES.includes(i.category)) i.category = "other"
  }
  return parsed
}
