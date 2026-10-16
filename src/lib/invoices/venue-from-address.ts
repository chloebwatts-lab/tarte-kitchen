import type { Venue } from "@/generated/prisma/client"

/**
 * Infer the Tarte venue from any customer-side text on an invoice, the
 * "Ship To" / "Deliver To" address OR the "Bill To" / account block (the
 * entity being charged). Same suburb (Currumbin) hosts two venues, so we
 * check concept names first, then fall back to suburb.
 *
 * IMPORTANT: only ever pass customer-side text here, never the supplier's
 * own name/letterhead. Some suppliers carry a suburb in their trading name
 * (e.g. "Bidfood … Burleigh Marr Distribution") which would mis-tag every
 * venue if scanned. The venue must come from where goods go / who pays.
 *
 * Returns null when nothing matches, callers should leave venue unset
 * rather than guessing.
 */
export function venueFromText(text: string | null | undefined): Venue | null {
  if (!text) return null
  const s = text.toUpperCase()

  if (s.includes("TEA GARDEN") || s.includes("TARTE MARKET")) return "TEA_GARDEN"
  if (s.includes("BEACH HOUSE")) return "BEACH_HOUSE"
  if (s.includes("BURLEIGH")) return "BURLEIGH"
  // Both Beach House and Tea Garden are in Currumbin, default to
  // Beach House since it's the higher-volume concept. If this turns
  // out to mis-tag Tea Garden deliveries, add a street-level rule.
  if (s.includes("CURRUMBIN")) return "BEACH_HOUSE"

  return null
}

/** @deprecated use {@link venueFromText}, kept as an alias for callers. */
export const venueFromDeliveryAddress = venueFromText

/**
 * Per-supplier venue fallback for invoices where the delivery address
 * doesn't parse (PDF formatting varies wildly across suppliers). Only
 * use for suppliers that deliver to a single venue, adding a multi-venue
 * supplier here would silently mis-route deliveries.
 *
 * Match is case-insensitive prefix-match on supplier name, so "Paramount
 * Liquor" / "Paramount Liquor Pty Ltd" both resolve.
 */
const SINGLE_VENUE_SUPPLIERS: Array<{ prefix: string; venue: Venue }> = [
  // Liquor: Beach House only (Burleigh isn't licensed for spirits in the
  // same way; per Chris 2026-05-17 all Paramount deliveries are Beach
  // House / Currumbin).
  { prefix: "paramount liquor", venue: "BEACH_HOUSE" },
  // Eustralis, pastry-supply only; pastry production runs out of Burleigh.
  // Pencilpay-emailed invoices have no deliveryAddress block so they were
  // landing in /spend unassigned otherwise.
  { prefix: "eustralis", venue: "BURLEIGH" },
  // Tasman Distribution (Tasman Star Seafood): Currumbin seafood only.
  // Its Stripe invoices carry no delivery address, and Louise books every
  // one to Beach House.
  { prefix: "tasman distribution", venue: "BEACH_HOUSE" },
]

export function defaultVenueForSupplier(
  supplierName: string | null | undefined
): Venue | null {
  if (!supplierName) return null
  const s = supplierName.toLowerCase()
  for (const rule of SINGLE_VENUE_SUPPLIERS) {
    if (s.startsWith(rule.prefix)) return rule.venue
  }
  return null
}

/**
 * Venue read off the EMAIL that carried the PDF, for suppliers whose PDFs
 * do not name the venue. Stronger than anything on the page for those
 * suppliers, so processInvoice applies it first.
 *
 * Parallel Roasters (coffee) raises one invoice per venue per week, both
 * with "tarte" as bill-to and deliver-to. Verified 2026-10-16 against Xero
 * Tarte Currumbin (bills SI-8978 .. SI-9530, Jul to Oct 2026): not one of
 * the 18 invoice numbers Unleashed emailed us in that period is a Currumbin
 * bill, so the Unleashed stream (noreply@unleashedsoftware.com) is Burleigh
 * only. Currumbin's invoice arrives only from accounts@parallelroasters.com
 * with subject "Tarte Beachouse" (Burleigh's copy of the same week comes
 * from that address too, subject "Tarte", and dedupes by invoice number).
 * The 55/45 "one shared weekly invoice" rule of 20 Sep 2026 rested on the
 * missing Currumbin stream and is gone.
 */
export interface EmailVenueHint {
  venue: Venue
  /** "subject": named by the sender in the subject line, overrides a stored
   * venue. "sender": implied by the sending system, only fills a blank. */
  source: "subject" | "sender"
}

export function venueHintFromEmail(
  supplierName: string | null | undefined,
  senderEmail: string | null | undefined,
  subject: string | null | undefined
): EmailVenueHint | null {
  const sup = (supplierName ?? "").toLowerCase()
  if (!sup.startsWith("parallel roasters")) return null
  const from = (senderEmail ?? "").toLowerCase().trim()
  const subj = (subject ?? "").toLowerCase()
  if (from === "accounts@parallelroasters.com") {
    if (/beach\W*house|beachouse|currumbin|\bbh\b/.test(subj)) {
      return { venue: "BEACH_HOUSE", source: "subject" }
    }
    if (/tarte|burleigh/.test(subj)) return { venue: "BURLEIGH", source: "subject" }
    return null
  }
  if (from === "noreply@unleashedsoftware.com") {
    return { venue: "BURLEIGH", source: "sender" }
  }
  return null
}
