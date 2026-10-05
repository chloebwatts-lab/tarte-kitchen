import { cookies } from "next/headers"

export type SalesVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: SalesVenue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is SalesVenue => VENUES.includes(v as SalesVenue)

/** ?venue= wins, then the venue this device remembers, then Beach House. */
export async function salesVenue(sp: { [key: string]: string | string[] | undefined }): Promise<SalesVenue> {
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  return isVenue(p) ? p : isVenue(c) ? c : "BEACH_HOUSE"
}
