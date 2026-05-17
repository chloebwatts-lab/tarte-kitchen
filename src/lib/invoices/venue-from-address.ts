import type { Venue } from "@/generated/prisma"

/**
 * Infer the Tarte venue from an invoice's "Ship To" / "Deliver To"
 * address string. Same suburb (Currumbin) hosts two venues, so we
 * check concept names first, then fall back to suburb.
 *
 * Returns null when nothing matches — callers should leave venue
 * unset rather than guessing.
 */
export function venueFromDeliveryAddress(
  address: string | null | undefined
): Venue | null {
  if (!address) return null
  const s = address.toUpperCase()

  if (s.includes("TEA GARDEN") || s.includes("TARTE MARKET")) return "TEA_GARDEN"
  if (s.includes("BEACH HOUSE")) return "BEACH_HOUSE"
  if (s.includes("BURLEIGH")) return "BURLEIGH"
  // Both Beach House and Tea Garden are in Currumbin — default to
  // Beach House since it's the higher-volume concept. If this turns
  // out to mis-tag Tea Garden deliveries, add a street-level rule.
  if (s.includes("CURRUMBIN")) return "BEACH_HOUSE"

  return null
}

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
