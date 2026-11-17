/**
 * The "Thank you :)" finishing page (Oliver, 12 Nov 2026). When a checklist
 * is fully done (every line ticked, the photos in, Complete tapped), staff get
 * a thank-you screen with one of the staff photos Oliver uploads on the GM
 * desk. Plain module, no db, so it can be unit tested.
 *
 * Oliver 17 Nov 2026: every department, both sites (it started on the FOH
 * daily cleans only). Burleigh and Currumbin each get their own photos.
 */

export interface FinishTemplate {
  area: string | null
  name: string
  cadence: string
  isFoodSafety: boolean
}

/**
 * True for every scheduled list (daily, weekly, monthly) in every department.
 * On-demand records (delivery temperatures, cooling logs) are filled per
 * delivery or per batch, often several a day, so they finish without one.
 */
export function getsThankYou(t: FinishTemplate): boolean {
  return t.cadence === "DAILY" || t.cadence === "WEEKLY" || t.cadence === "MONTHLY"
}

/** Oliver's two photo sets. Tea Garden is at Currumbin, so it shares Beach House's. */
export const PHOTO_SITES = [
  { key: "BURLEIGH", label: "Burleigh", venues: ["BURLEIGH"], saveAs: "BURLEIGH" },
  { key: "CURRUMBIN", label: "Currumbin", venues: ["BEACH_HOUSE", "TEA_GARDEN"], saveAs: "BEACH_HOUSE" },
] as const

export type PhotoSiteKey = (typeof PHOTO_SITES)[number]["key"]

/** The photo set a venue (or an old ?venue= link) belongs to. */
export function photoSiteOf(venueOrSite: string | null | undefined): PhotoSiteKey | null {
  const v = String(venueOrSite ?? "").trim().toUpperCase()
  for (const s of PHOTO_SITES) if (s.key === v || (s.venues as readonly string[]).includes(v)) return s.key
  return null
}

/** One photo from the pool, or null when there are none. `rand` is in [0, 1). */
export function pickOne<T>(pool: readonly T[], rand: number = Math.random()): T | null {
  if (pool.length === 0) return null
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rand * pool.length)))
  return pool[i]
}

/**
 * The photos a venue's thank-you page picks from: its own site's (Burleigh,
 * or Currumbin = Beach House + Tea Garden) when there are any, otherwise
 * every venue's, so a site with no photos of its own still says thank you
 * (Chloe 13 Nov 2026: one shared pool until then).
 */
export function photoPool<T extends { venue: string }>(all: readonly T[], venue: string): T[] {
  const site = photoSiteOf(venue)
  const own = site ? all.filter((p) => photoSiteOf(p.venue) === site) : []
  return own.length > 0 ? own : [...all]
}

/**
 * A lighter copy of the photo for the iPad: Cloudinary resizes it to at most
 * 1400px tall and picks the best format, so it loads fast on the shop wifi.
 * Anything that is not a plain Cloudinary upload URL is returned unchanged.
 */
export function thankYouDisplayUrl(url: string): string {
  const marker = "/image/upload/"
  const i = url.indexOf(marker)
  if (i < 0 || !url.startsWith("https://res.cloudinary.com/")) return url
  const rest = url.slice(i + marker.length)
  if (rest.startsWith("f_auto")) return url
  return `${url.slice(0, i + marker.length)}f_auto,q_auto,c_limit,h_1400/${rest}`
}

/** Only Cloudinary image URLs from our own account go in the pool. */
export function isOurCloudinaryUrl(url: string, cloudName: string | undefined): boolean {
  if (!cloudName) return false
  try {
    const u = new URL(url)
    return u.protocol === "https:" && u.hostname === "res.cloudinary.com" && u.pathname.startsWith(`/${cloudName}/image/upload/`)
  } catch {
    return false
  }
}
