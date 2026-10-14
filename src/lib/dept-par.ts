import { normaliseName, personMatches, type MatchPerson } from "@/lib/access/match"
import { meetsTier, type Tier } from "@/lib/access/tiers"

/**
 * Par levels on a department order form (Jess, 14 Oct 2026: "I need to be
 * able to edit this number, but ideally only me"). The department head set
 * on /order-departments is the one who may edit them; the office login and
 * the owner's phone always can. Where no head is named yet, a Manager can,
 * so the column is never stuck read-only.
 */

/**
 * Does the signed-in person hold the name on the department? The owner name
 * is typed by hand ("Jess", "Jess Passos"), the person's name comes from
 * Shifts ("Jessica Passos Le Rose"), so beyond the exact and first-name
 * rules in access/match.ts, each word of the owner name may be the start of
 * a word in the person's name, when it is at least three letters long.
 */
export function isDeptOwner(ownerName: string | null | undefined, person: MatchPerson | null): boolean {
  if (!ownerName || !person) return false
  if (personMatches(ownerName, person)) return true
  const ownerWords = normaliseName(ownerName).split(" ").filter(Boolean)
  const nameWords = normaliseName(person.name).split(" ").filter(Boolean)
  if (ownerWords.length === 0 || nameWords.length === 0) return false
  return ownerWords.every((w) => nameWords.some((n) => (w.length >= 3 ? n.startsWith(w) : n === w)))
}

export function mayEditPar(args: { ownerName: string | null | undefined; person: MatchPerson | null; tier: Tier | null }): boolean {
  if (meetsTier(args.tier, "OWNER")) return true
  if (args.ownerName) return isDeptOwner(args.ownerName, args.person)
  return meetsTier(args.tier, "MANAGER")
}

/**
 * A par typed on the form: packs, never negative, two decimals. Null clears
 * it. Rubbish ("abc", "-2") also clears rather than saving something odd.
 */
export function parsePar(raw: string | number | null | undefined): number | null {
  if (raw == null) return null
  const n = typeof raw === "number" ? raw : Number(String(raw).trim())
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.round(n * 100) / 100
}
