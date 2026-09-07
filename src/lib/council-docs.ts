/**
 * Council folder document helpers shared by /council, /council/[venue]
 * and /kitchen/inspection.
 */

type ExpiringDoc = {
  venue: string
  type: string
  expiresOn: Date | null
  title?: string
}

/** AEST calendar-day midnight as a UTC-midnight Date (same convention the
 *  council pages already use, so expiresOn dates compare like-for-like). */
export function councilToday(): Date {
  const d = new Date(Date.now() + 10 * 60 * 60 * 1000)
  d.setUTCHours(0, 0, 0, 0)
  return d
}

/**
 * A document is "superseded" when it has expired AND a later-expiring
 * document of the same venue + type is on file. Renewals are filed beside
 * the old certificate (kept for the audit trail) rather than replacing it,
 * so without this the folder would shout "Expired" at an EHO about a
 * licence that has already been renewed and filed one line above.
 */
export function isSuperseded<T extends ExpiringDoc>(doc: T, all: readonly T[]): boolean {
  if (!doc.expiresOn) return false
  const exp = new Date(doc.expiresOn).getTime()
  if (exp >= councilToday().getTime()) return false
  return all.some(
    (o) =>
      o !== doc &&
      o.venue === doc.venue &&
      o.type === doc.type &&
      o.expiresOn !== null &&
      new Date(o.expiresOn).getTime() > exp,
  )
}
