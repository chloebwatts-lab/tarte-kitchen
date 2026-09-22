import { KitchenStation, Venue } from "@/generated/prisma/client"
import type { SingleVenue } from "@/lib/venues"

/**
 * Human labels for kitchen stations. Every venue now counts on ONE sheet
 * (station MAIN). Beach House has two kitchens, Restaurant and Cafe, but
 * since Jose's one-list change (2026-09-22) they share the list and each
 * item carries the section responsible for it instead. RESTAURANT and CAFE
 * remain for the history recorded before that.
 */
export const STATION_LABEL: Record<KitchenStation, string> = {
  RESTAURANT: "Restaurant kitchen",
  CAFE: "Cafe kitchen",
  MAIN: "Kitchen",
}

export const STATION_SHORT_LABEL: Record<KitchenStation, string> = {
  RESTAURANT: "Restaurant",
  CAFE: "Cafe",
  MAIN: "Kitchen",
}

/**
 * Which stations exist at each venue. Iterate this instead of hardcoding,
 * the restock flow renders one count sheet per station.
 */
export const VENUE_STATIONS: Record<SingleVenue, KitchenStation[]> = {
  BEACH_HOUSE: ["MAIN"],
  BURLEIGH: ["MAIN"],
  TEA_GARDEN: ["MAIN"],
}

export function stationsForVenue(venue: Venue): KitchenStation[] {
  if (venue === "BOTH") return []
  return VENUE_STATIONS[venue as SingleVenue] ?? []
}

export function isKitchenStation(s: string | null): s is KitchenStation {
  return s === "RESTAURANT" || s === "CAFE" || s === "MAIN"
}

/** What to call a station at a venue: Beach House's one list is both kitchens. */
export function stationLabel(venue: Venue, station: KitchenStation): string {
  if (venue === "BEACH_HOUSE" && station === "MAIN") return "Both kitchens, one list"
  return STATION_LABEL[station]
}

export function stationShortLabel(venue: Venue, station: KitchenStation): string {
  if (venue === "BEACH_HOUSE" && station === "MAIN") return "Both kitchens"
  return STATION_SHORT_LABEL[station]
}

// ─── Prep list sections (Jose's "Responsible" column) ──────────────

/**
 * Beach House's single prep list is split by who is responsible for making
 * each item, in this order. The section lives in PrepStockItem.category, so
 * the count sheet, paper sheet and morning run all group by it. Restaurant
 * and Café are the two kitchens, KP fills the bottles, and Main prep is
 * Michelle's production list (sauces, butters, soups, proteins).
 */
export const PREP_SECTIONS = ["Restaurant", "Café", "KP", "Main prep"] as const
export type PrepSection = (typeof PREP_SECTIONS)[number]

/** Who owns a section, shown next to its heading. */
export const PREP_SECTION_OWNER: Partial<Record<PrepSection, string>> = {
  "Main prep": "Michelle",
}

/** Venues whose list is split by responsible section. */
export function prepSectionsFor(venue: Venue): readonly PrepSection[] {
  return venue === "BEACH_HOUSE" ? PREP_SECTIONS : []
}

/**
 * Sort key for a category: the named sections in their order, the old
 * "Station restock" header next, anything else after that alphabetically.
 */
export function sectionRank(category: string): number {
  const i = (PREP_SECTIONS as readonly string[]).indexOf(category)
  if (i >= 0) return i
  if (category === "Station restock") return PREP_SECTIONS.length
  return PREP_SECTIONS.length + 1
}
