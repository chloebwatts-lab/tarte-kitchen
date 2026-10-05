import { cookies } from "next/headers"

export type PastryVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is PastryVenue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

/**
 * Explicit ?venue= wins; otherwise the venue remembered by the picker's
 * tk-venue cookie. Never silently default to a venue.
 */
export async function pastryVenue(sp: { [key: string]: string | string[] | undefined }): Promise<PastryVenue | null> {
  const param = typeof sp.venue === "string" ? sp.venue : null
  if (isVenue(param)) return param
  const cookie = (await cookies()).get("tk-venue")?.value ?? null
  return isVenue(cookie) ? cookie : null
}
