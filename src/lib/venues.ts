import { Venue } from "@/generated/prisma"

/**
 * Human-readable labels for each venue. Use these anywhere a venue
 * is rendered in the UI — never hardcode "Burleigh" / "Currumbin" etc.
 */
export const VENUE_LABEL: Record<Venue, string> = {
  BURLEIGH: "Tarte Bakery (Burleigh)",
  BEACH_HOUSE: "Tarte Beach House (Currumbin)",
  TEA_GARDEN: "Tarte Tea Garden (Currumbin)",
  BOTH: "All venues",
}

/**
 * Short labels (for tight UI like chart legends and segmented toggles).
 */
export const VENUE_SHORT_LABEL: Record<Venue, string> = {
  BURLEIGH: "Bakery",
  BEACH_HOUSE: "Beach House",
  TEA_GARDEN: "Tea Garden",
  BOTH: "All",
}

/**
 * The three real venues (never include BOTH). Iterate this in UIs and
 * per-venue loops instead of hardcoding enum values.
 */
export const SINGLE_VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as const
export type SingleVenue = (typeof SINGLE_VENUES)[number]

/**
 * Recharts fill colors — keyed by venue so stacked bar charts stay consistent
 * across every dashboard.
 */
export const VENUE_CHART_COLOR: Record<Venue, string> = {
  BURLEIGH: "#3b82f6", // blue
  BEACH_HOUSE: "#06b6d4", // cyan
  TEA_GARDEN: "#a855f7", // violet
  BOTH: "#64748b", // slate (rarely rendered)
}

/**
 * Loosely match a string to a Venue. Accepts:
 *  - exact enum values: "BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"
 *  - legacy "CURRUMBIN" → BEACH_HOUSE (pre-3-venue split)
 *  - display names: "Tarte Bakery", "Beach House", "Tea Garden", "Burleigh"
 *  - Lightspeed location names containing any of the above
 *
 * Returns null if no match. Use this when resolving external identifiers
 * (Lightspeed location names, email report location columns).
 */
export function normalizeVenueSlug(input: string | null | undefined): Venue | null {
  if (!input) return null
  const s = input.trim().toUpperCase()

  // Exact enum match
  if (s === "BURLEIGH") return "BURLEIGH"
  if (s === "BEACH_HOUSE" || s === "BEACH HOUSE") return "BEACH_HOUSE"
  if (s === "TEA_GARDEN" || s === "TEA GARDEN") return "TEA_GARDEN"

  // Legacy
  if (s === "CURRUMBIN") return "BEACH_HOUSE"

  // Substring match on concept names (priority: Tea Garden before Beach House
  // before Burleigh, since "Currumbin" alone is ambiguous — default to Beach House)
  if (s.includes("TEA GARDEN") || s.includes("TEA_GARDEN") || s.includes("TEAGARDEN")) {
    return "TEA_GARDEN"
  }
  if (s.includes("BEACH HOUSE") || s.includes("BEACH_HOUSE") || s.includes("BEACHHOUSE")) {
    return "BEACH_HOUSE"
  }
  if (s.includes("BAKERY") || s.includes("BURLEIGH")) return "BURLEIGH"
  // "Tarte Market" is the Lightspeed site name for the Burleigh bakery.
  if (s.includes("MARKET")) return "BURLEIGH"
  if (s.includes("CURRUMBIN")) return "BEACH_HOUSE"

  return null
}
