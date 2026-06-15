import type { Venue } from "@/generated/prisma"

/**
 * Infer the Tarte venue from any customer-side text on an invoice — the
 * "Ship To" / "Deliver To" address OR the "Bill To" / account block (the
 * entity being charged). Same suburb (Currumbin) hosts two venues, so we
 * check concept names first, then fall back to suburb.
 *
 * IMPORTANT: only ever pass customer-side text here — never the supplier's
 * own name/letterhead. Some suppliers carry a suburb in their trading name
 * (e.g. "Bidfood … Burleigh Marr Distribution") which would mis-tag every
 * venue if scanned. The venue must come from where goods go / who pays.
 *
 * Returns null when nothing matches — callers should leave venue unset
 * rather than guessing.
 */
export function venueFromText(text: string | null | undefined): Venue | null {
  if (!text) return null
  const s = text.toUpperCase()

  if (s.includes("TEA GARDEN") || s.includes("TARTE MARKET")) return "TEA_GARDEN"
  if (s.includes("BEACH HOUSE")) return "BEACH_HOUSE"
  if (s.includes("BURLEIGH")) return "BURLEIGH"
  // Both Beach House and Tea Garden are in Currumbin — default to
  // Beach House since it's the higher-volume concept. If this turns
  // out to mis-tag Tea Garden deliveries, add a street-level rule.
  if (s.includes("CURRUMBIN")) return "BEACH_HOUSE"

  return null
}

/** @deprecated use {@link venueFromText} — kept as an alias for callers. */
export const venueFromDeliveryAddress = venueFromText

/**
 * Per-supplier venue fallback for invoices where the delivery address
 * doesn't parse (PDF formatting varies wildly across suppliers). Only
 * use for suppliers that deliver to a single venue — adding a multi-venue
 * supplier here would silently mis-route deliveries.
 *
 * Match is case-insensitive prefix-match on supplier name, so "Paramount
 * Liquor" / "Paramount Liquor Pty Ltd" both resolve.
 */
const SINGLE_VENUE_SUPPLIERS: Array<{ prefix: string; venue: Venue }> = [
  // Liquor — Beach House only (Burleigh isn't licensed for spirits in the
  // same way; per Chris 2026-05-17 all Paramount deliveries are Beach
  // House / Currumbin).
  { prefix: "paramount liquor", venue: "BEACH_HOUSE" },
  // Eustralis — pastry-supply only; pastry production runs out of Burleigh.
  // Pencilpay-emailed invoices have no deliveryAddress block so they were
  // landing in /spend unassigned otherwise.
  { prefix: "eustralis", venue: "BURLEIGH" },
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
