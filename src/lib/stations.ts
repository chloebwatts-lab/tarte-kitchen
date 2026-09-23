import { KitchenStation, Venue } from "@/generated/prisma/client"
import type { SingleVenue } from "@/lib/venues"

/**
 * Human labels for kitchen stations. Every venue now counts on ONE sheet
 * (station MAIN). Beach House has two kitchens, Restaurant and Cafe, but
 * since Jose's one-list change (2026-09-22) they share the list and each
 * item carries the section responsible for it instead. Burleigh's Main
 * kitchen, Market and Production share one list the same way (Vini,
 * 2026-09-23). RESTAURANT and CAFE remain for the history recorded before
 * that.
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

/** What to call a station at a venue: a sectioned list is the whole venue. */
export function stationLabel(venue: Venue, station: KitchenStation): string {
  if (venue === "BEACH_HOUSE" && station === "MAIN") return "Both kitchens, one list"
  if (venue === "BURLEIGH" && station === "MAIN") return "Main kitchen, Market and Production"
  return STATION_LABEL[station]
}

export function stationShortLabel(venue: Venue, station: KitchenStation): string {
  if (venue === "BEACH_HOUSE" && station === "MAIN") return "Both kitchens"
  if (venue === "BURLEIGH" && station === "MAIN") return "All stations"
  return STATION_SHORT_LABEL[station]
}

// ─── Prep list sections ─────────────────────────────────────────────

/**
 * A venue's single prep list can be split into sections, in this order.
 * The section lives in PrepStockItem.category, so the count sheet, paper
 * sheet and morning run all group by it.
 *
 * Beach House splits by who is responsible (Jose's "Responsible" column):
 * Restaurant and Café are the two kitchens, KP fills the bottles, and Main
 * prep is Michelle's production list (sauces, butters, soups, proteins).
 *
 * Burleigh splits by station (Vini's three paper sheets): the Main kitchen
 * has a grill and a larder list, the Market has its own grill and larder
 * list, and Production is the bulk list (sauces, mixes, proteins, soups)
 * the stations draw on. The same prep can sit on two stations' lists.
 */
export const VENUE_PREP_SECTIONS = {
  BEACH_HOUSE: ["Restaurant", "Café", "KP", "Main prep"],
  BURLEIGH: [
    "Main kitchen grill",
    "Main kitchen larder",
    "Market grill",
    "Market larder",
    "Production",
  ],
  TEA_GARDEN: [],
} as const satisfies Record<SingleVenue, readonly string[]>

export type PrepSection = (typeof VENUE_PREP_SECTIONS)[SingleVenue][number]

/** Every section across venues, in venue-list order; the sort key below. */
const ALL_PREP_SECTIONS: readonly string[] = [
  ...VENUE_PREP_SECTIONS.BEACH_HOUSE,
  ...VENUE_PREP_SECTIONS.BURLEIGH,
  ...VENUE_PREP_SECTIONS.TEA_GARDEN,
]

/** Who owns a section, shown next to its heading. */
export const PREP_SECTION_OWNER: Partial<Record<PrepSection, string>> = {
  "Main prep": "Michelle",
}

/** Venues whose list is split by section; empty for a plain station list. */
export function prepSectionsFor(venue: Venue): readonly PrepSection[] {
  if (venue === "BOTH") return []
  return VENUE_PREP_SECTIONS[venue as SingleVenue] ?? []
}

/**
 * The small label after a section heading: the owner's name where a
 * section has one, "responsible" on Beach House's who-makes-it list, and
 * nothing on Burleigh, where the heading already names the station.
 */
export function sectionHint(venue: Venue, section: string): string | null {
  const owner = PREP_SECTION_OWNER[section as PrepSection]
  if (owner) return owner
  if (venue === "BEACH_HOUSE") return "responsible"
  return null
}

/** The question next to the section chips when a chef adds a prep. */
export function sectionPrompt(venue: Venue): string {
  return venue === "BURLEIGH" ? "Which station:" : "Who makes it:"
}

/** How the restock hub describes the venue's list. */
export function prepListDescription(venue: Venue): string {
  switch (venue) {
    case "BEACH_HOUSE":
      return "One prep list for both kitchens. Each item names who makes it (Restaurant, Café, KP, or Michelle's main prep), and anyone can add a prep. Closing chefs count it at the end of the shift; the prep chef runs it next morning."
    case "BURLEIGH":
      return "One prep list for the whole kitchen, in Vini's sections: Main kitchen grill and larder, Market grill and larder, and Production. Anyone can add a prep and says which station it is for. Closing chefs count it at the end of the shift; the prep chef runs it next morning."
    default:
      return "Closing chefs count each kitchen at the end of the shift. The prep chef runs one consolidated list next morning and restocks both kitchens before service."
  }
}

/**
 * Sort key for a category: the named sections in their venue's order, the
 * old "Station restock" header next, anything else after that alphabetically.
 * Section names never repeat across venues, so one flat order serves all.
 */
export function sectionRank(category: string): number {
  const i = ALL_PREP_SECTIONS.indexOf(category)
  if (i >= 0) return i
  if (category === "Station restock") return ALL_PREP_SECTIONS.length
  return ALL_PREP_SECTIONS.length + 1
}
