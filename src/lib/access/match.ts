/**
 * How a name on one of Chloe's lists (quiet list, tier overrides) is matched
 * to the person signed in. An entry is one of:
 *   - a Tarte Shifts staff id, exact;
 *   - a full name as Shifts holds it, "First Last", case and spacing ignored;
 *   - a single word, matched to the first name only (Chloe knows people as
 *     "Cande" or "Lola"; two people sharing a first name both match, which
 *     is the safe direction for a restriction and easy to fix for a grant).
 */

export interface MatchPerson {
  id: string
  name: string
}

export function normaliseName(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase()
}

export function personMatches(entry: string, person: MatchPerson): boolean {
  const e = normaliseName(entry)
  if (!e) return false
  if (entry === person.id) return true
  const name = normaliseName(person.name)
  if (e === name) return true
  if (!e.includes(" ")) {
    const first = name.split(" ")[0]
    return first === e
  }
  return false
}
