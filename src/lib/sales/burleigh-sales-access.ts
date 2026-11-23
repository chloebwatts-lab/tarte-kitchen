/**
 * Burleigh daily sales, the basics (/kitchen/sales/burleigh). Chloe,
 * 23 Nov 2026: "give vinicius access to daily sales for burleigh, basics are
 * fine for him". A grant on his own sign in, no managers password, so the
 * full Sales insights page (both venues, hourly, averages) stays where it is.
 *
 * Who may open it:
 *   - the office login and an owner's phone;
 *   - Chloe Watts and Shawna Pate on their own sign in (mayTrustDevice);
 *   - everyone on BURLEIGH_SALES_STAFF below;
 *   - anyone Chloe adds later to AppSetting `burleighSalesStaff`, a JSON
 *     array of strings matched as in access/match.ts (a Shifts staff id, a
 *     full name, or a first name on its own). A missing or broken row adds
 *     nobody: a grant fails closed.
 *
 * This file is the pure part so it can be unit tested; the cookie and
 * database reads are in burleigh-sales-auth.ts.
 */

import { personMatches, type MatchPerson } from "@/lib/access/match"

export const BURLEIGH_SALES_SETTING_KEY = "burleighSalesStaff"
export const BURLEIGH_SALES_HREF = "/kitchen/sales/burleigh"

/** Granted in code. Vinicius Sequeira by Shifts id and full name (Chloe, 23 Nov 2026). */
export const BURLEIGH_SALES_STAFF = ["cmrlcnxw0000bq1s8pgc8n2ej", "Vinicius Sequeira"]

/** The stored list. Missing, unreadable or the wrong shape is an empty list. */
export function parseBurleighSalesList(raw: string | null | undefined): string[] {
  if (raw == null) return []
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return []
    return v
  } catch {
    return []
  }
}

/** True when the signed-in person is granted in code or on the list held in `raw`. */
export function isBurleighSalesPerson(raw: string | null | undefined, person: MatchPerson | null): boolean {
  if (!person) return false
  return [...BURLEIGH_SALES_STAFF, ...parseBurleighSalesList(raw)].some((entry) => personMatches(entry, person))
}
