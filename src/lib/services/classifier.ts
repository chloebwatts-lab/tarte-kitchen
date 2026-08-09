import Anthropic from "@anthropic-ai/sdk"
import { SERVICE_CATEGORIES } from "@/lib/services/constants"

/**
 * Classifies one email (subject + body + optional PDF attachments) as
 * venue-service activity or not. One email can yield multiple visits:
 * a pest treatment covering both venues on the same day, or an invoice
 * that also confirms the next booking.
 */

export interface ClassifiedVisit {
  venue: "BURLEIGH" | "BEACH_HOUSE" | "BOTH"
  category: string
  kind: "COMPLETED" | "BOOKED"
  /** YYYY-MM-DD */
  serviceDate: string
  providerName: string | null
  /** Ex GST where determinable. */
  totalExGst: number | null
  note: string | null
}

export interface ServiceClassification {
  isService: boolean
  reason: string
  visits: ClassifiedVisit[]
}

const CATEGORY_LIST = SERVICE_CATEGORIES.map(
  (c) => `- "${c.key}": ${c.label}${c.key === "other" ? " (anything recurring that fits nothing above)" : ""}`
).join("\n")

function buildPrompt(input: {
  subject: string
  from: string
  receivedDate: string
  bodyText: string
  programHints: string
}): string {
  return `You are reading one email from a Gold Coast hospitality group's accounts inbox. Decide whether it documents a RECURRING VENUE SERVICE at one of our two sites, and extract the visit(s).

Our sites (venue values):
- "BURLEIGH": Tarte Bakery, 2 West Street, Burleigh Heads
- "BEACH_HOUSE": Tarte Beach House / Tarte Currumbin / Tea Garden / Tarte Market, 796-808 Pacific Parade, Currumbin (all Currumbin trading names are this ONE venue)
- "BOTH" only when the document clearly covers both sites.

Service categories:
${CATEGORY_LIST}

Known providers per program (hints, not exhaustive):
${input.programHints || "(none recorded yet)"}

What counts as a service email: invoices, service reports/dockets, work orders, booking confirmations or scheduling emails for things like grease trap pump-outs, pest control, canopy/flue/exhaust cleans, filter exchanges, fire equipment testing, contracted deep cleans, test & tag, backflow testing, scheduled coffee machine or air-con servicing. Forwarded emails (Fwd:) count, read the forwarded content.

What does NOT count (isService=false): food/beverage supplier invoices, one-off equipment REPAIRS or breakdown callouts, utility bills, rent, insurance, accounting, marketing, linen/laundry deliveries, our own app's automated emails, newsletters, payment reminders about non-service invoices, and general waste/recycling BIN collections.

Waste contractors (JJ's Waste / JJ Richards etc.): their monthly invoice covers bin collections AND sometimes grease trap ("grease arrestor" / "liquid waste") services. Only a grease arrestor / grease trap / liquid waste line counts, as "grease-trap" with that line's service date and that line's cost only. An invoice with only general waste/recycling bins is isService=false. JJ's Waste customer number 01015432 = BEACH_HOUSE, customer number 01013429 = BURLEIGH.

kind rules:
- "COMPLETED": the service has happened (tax invoice for work done, service report, docket). Use the SERVICE date if shown, else the invoice date.
- "BOOKED": a future visit is being scheduled/confirmed. Use the scheduled date. If an invoice also states the next visit date, return TWO visits: the COMPLETED one and a BOOKED one.
- An email about a booking whose date has already passed is still "BOOKED" (we reconcile later).

Return ONLY valid JSON:
{
  "isService": boolean,
  "reason": "one short sentence",
  "visits": [
    {
      "venue": "BURLEIGH" | "BEACH_HOUSE" | "BOTH",
      "category": "one of the category keys above",
      "kind": "COMPLETED" | "BOOKED",
      "serviceDate": "YYYY-MM-DD (Australian emails: 6/05/2026 means 6 May 2026)",
      "providerName": "company name or null",
      "totalExGst": number or null (ex-GST total for THIS venue's share if split, divide inc-GST by 1.1),
      "note": "short detail worth keeping (e.g. 'quarterly treatment, report attached') or null"
    }
  ]
}
If isService is false, return "visits": [].
If the venue cannot be determined at all, prefer "BOTH" only with evidence; otherwise pick the likelier venue from address/account details and say so in the note.

Email received: ${input.receivedDate}
From: ${input.from}
Subject: ${input.subject}

Body:
${input.bodyText.slice(0, 12000)}`
}

export async function classifyServiceEmail(input: {
  subject: string
  from: string
  receivedDate: string
  bodyText: string
  pdfAttachments: Buffer[]
  programHints: string
}): Promise<ServiceClassification> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content: Anthropic.ContentBlockParam[] = []
  // Cap at 2 PDFs per email, service emails rarely carry more and huge
  // multi-attachment threads shouldn't blow the request size.
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

  const parsed = JSON.parse(jsonStr) as ServiceClassification
  if (typeof parsed.isService !== "boolean" || !Array.isArray(parsed.visits)) {
    throw new Error("Invalid classification shape")
  }
  // Drop malformed rows rather than failing the whole email.
  parsed.visits = parsed.visits.filter(
    (v) =>
      ["BURLEIGH", "BEACH_HOUSE", "BOTH"].includes(v.venue) &&
      ["COMPLETED", "BOOKED"].includes(v.kind) &&
      typeof v.category === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v.serviceDate ?? "")
  )
  return parsed
}
