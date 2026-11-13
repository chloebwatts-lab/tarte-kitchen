/**
 * The "Thank you :)" finishing page (Oliver, 12 Nov 2026). When an FOH daily
 * clean is fully done (every line ticked, the photos in, Complete tapped),
 * staff get a thank-you screen with one of the staff photos Oliver uploads on
 * the GM desk. Plain module, no db, so it can be unit tested.
 */

/** Areas that are front of house. Kitchen, KP, pastry and food safety are not. */
const FOH_AREAS = new Set(["foh", "barista", "market", "takeaway", "bar"])

export interface FinishTemplate {
  area: string | null
  name: string
  cadence: string
  isFoodSafety: boolean
}

/** True for a daily FOH cleaning list (the ones that end with site photos). */
export function isFohDailyClean(t: FinishTemplate): boolean {
  if (t.cadence !== "DAILY" || t.isFoodSafety) return false
  const area = (t.area ?? "").trim().toLowerCase()
  if (FOH_AREAS.has(area) || area.startsWith("foh")) return true
  // "FOH KP — Daily Close" sits under the KP area but is the FOH kitchen hand.
  return /^foh\b/i.test(t.name.trim())
}

/** One photo from the pool, or null when there are none. `rand` is in [0, 1). */
export function pickOne<T>(pool: readonly T[], rand: number = Math.random()): T | null {
  if (pool.length === 0) return null
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(rand * pool.length)))
  return pool[i]
}

/**
 * The photos a venue's thank-you page picks from: its own when it has any,
 * otherwise every venue's (Chloe 13 Nov 2026: one shared pool, so Currumbin
 * and Tea Garden lists say thank you too before they have photos of their own).
 */
export function photoPool<T extends { venue: string }>(all: readonly T[], venue: string): T[] {
  const own = all.filter((p) => p.venue === venue)
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
