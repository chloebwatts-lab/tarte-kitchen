import type { Venue } from "@/generated/prisma/client"

/**
 * Which POS is the source of truth for a venue on a given trading day.
 *
 * Square went live at Currumbin (Beach House + Tea Garden) on Thu 1 Oct 2026;
 * Burleigh follows (~13 Oct 2026). Until a venue's cutover, Lightspeed EOD
 * emails / API fill DailySalesSummary; from the cutover the Square daily
 * summary email does, and the Lightspeed importers must not overwrite it
 * (Lightspeed keeps emailing $0 reports for a venue after its tills go dark).
 *
 * Override without a deploy via SQUARE_CUTOVER, a JSON object of
 * venue -> YYYY-MM-DD, e.g. {"BURLEIGH":"2026-10-13"}; keys given there
 * replace the defaults below one by one.
 */
const DEFAULT_SQUARE_CUTOVER: Partial<Record<Venue, string>> = {
  BEACH_HOUSE: "2026-10-01",
  TEA_GARDEN: "2026-10-01",
}

export function squareCutoverMap(
  env: string | undefined = process.env.SQUARE_CUTOVER
): Partial<Record<Venue, string>> {
  const out: Partial<Record<Venue, string>> = { ...DEFAULT_SQUARE_CUTOVER }
  if (!env) return out
  try {
    const parsed = JSON.parse(env) as Record<string, unknown>
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        out[k as Venue] = v
      } else if (v === null) {
        delete out[k as Venue]
      }
    }
  } catch {
    // Malformed env: keep defaults rather than silently flipping sources.
  }
  return out
}

/** True when Square is the POS for `venue` on `date` (YYYY-MM-DD or Date). */
export function isSquareVenueOn(
  venue: Venue,
  date: Date | string,
  env?: string
): boolean {
  const cutover = squareCutoverMap(env)[venue]
  if (!cutover) return false
  const key = typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10)
  return key >= cutover
}
