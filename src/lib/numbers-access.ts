/**
 * Wages + COGS (Chloe, 15 Nov 2026): the live wage % and COGS page inside
 * the Managers area is for Chloe and Shawna only. Chloe, 23 Nov 2026:
 * "really only Shawna, Oliver and I", so Oliver Warren (GM) is added.
 *
 * Unlike the quiet lists (which take pages away from named people), this is
 * a grant. The page and its tile exist only for:
 *   - the office login and an owner's phone;
 *   - the two owners who may keep a phone signed in (person-auth
 *     mayTrustDevice: Chloe Watts and Shawna Pate), on any device;
 *   - Oliver Warren on his own sign in (NUMBERS_BUILT_IN, full name only so
 *     no other Oliver ever matches);
 *   - anyone Chloe adds later to AppSetting `wagesCogsStaff`, a JSON array
 *     of strings matched as in access/match.ts (a Shifts staff id, a full
 *     name, or a first name on its own). No row is needed for the two of
 *     them; a missing or broken list adds nobody: a grant fails closed.
 *
 * This file is the pure part so it can be unit tested; the cookie and
 * database reads are in numbers-auth.ts.
 */

import { personMatches, type MatchPerson } from "@/lib/access/match"

export const NUMBERS_SETTING_KEY = "wagesCogsStaff"
export const NUMBERS_HREF = "/kitchen/managers/numbers"

/** The stored list. Missing, unreadable or the wrong shape is an empty list. */
export function parseNumbersList(raw: string | null | undefined): string[] {
  if (raw == null) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return []
    return v
  } catch {
    return []
  }
}

/** Always granted, no AppSetting row needed. Full names only. */
export const NUMBERS_BUILT_IN = ["Oliver Warren"] as const

/** True when the signed-in person is built in or on the list held in `raw`. */
export function isNumbersPerson(raw: string | null | undefined, person: MatchPerson | null): boolean {
  if (!person) return false
  if (NUMBERS_BUILT_IN.some((entry) => personMatches(entry, person))) return true
  return parseNumbersList(raw).some((entry) => personMatches(entry, person))
}
