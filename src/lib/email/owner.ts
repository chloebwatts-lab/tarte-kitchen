/**
 * Chloe, 12 Nov 2026: only vital emails; folded into the 17:00 Tarte today
 * email. Senders that used to copy the owner drop her address with this and
 * keep everyone else. Pure, tested in owner.test.ts.
 */

export const OWNER_EMAIL = "chloe@tarte.com.au"

/** Comma list or array in, the same addresses out minus chloe@ (any case, trimmed, blanks dropped). */
export function withoutOwner(list: string | string[] | null | undefined): string[] {
  const items = Array.isArray(list) ? list : (list ?? "").split(",")
  return items.map((s) => s.trim()).filter((s) => s && s.toLowerCase() !== OWNER_EMAIL)
}
