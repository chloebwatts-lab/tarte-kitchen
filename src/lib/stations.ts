import { KitchenStation, Venue } from "@/generated/prisma"
import type { SingleVenue } from "@/lib/venues"

/**
 * Human labels for kitchen stations. Beach House runs two kitchens
 * (Restaurant + Cafe); Burleigh and Tea Garden each run one.
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
 * Which stations exist at each venue. Iterate this instead of hardcoding —
 * the restock flow renders one count sheet per station.
 */
export const VENUE_STATIONS: Record<SingleVenue, KitchenStation[]> = {
  BEACH_HOUSE: ["RESTAURANT", "CAFE"],
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
