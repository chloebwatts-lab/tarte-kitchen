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
