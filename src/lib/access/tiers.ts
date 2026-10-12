/**
 * Access tiers for the staff area (Chloe, 12 Oct 2026).
 *
 * Every staff sign-in carries the role Tarte Shifts holds for that person
 * (person-auth PersonRole). The tiers are that role, ranked:
 *
 *   STAFF    checklists, logs, stock walk, prep walk-through (no costs or
 *            forecasts), pastry tasks, report / fix / services / printers
 *            (no till login), inspection view
 *   SENIOR   plus ordering, the order sheet, where to buy, serves and
 *            portions, high tea, functions
 *   MANAGER  plus the Managers area (still behind its password), the
 *            meeting deck, costs and the till login
 *   OWNER    everything; the office login and the owner's phone
 *
 * Pages under a prefix below need at least that tier; anything not listed
 * is STAFF. Enforced in the data layer (assertTier in the actions) as well
 * as on the page, so numbers a tier may not see never reach the browser.
 * This file is the pure part so it can be unit tested; cookie reads are in
 * tier-auth.ts.
 */

import type { PersonRole } from "@/lib/person-auth"

export type Tier = "STAFF" | "SENIOR" | "MANAGER" | "OWNER"

const RANK: Record<Tier, number> = { STAFF: 0, SENIOR: 1, MANAGER: 2, OWNER: 3 }

export function tierOfRole(role: PersonRole): Tier {
  switch (role) {
    case "OWNER":
      return "OWNER"
    case "MANAGER":
      return "MANAGER"
    case "SUPERVISOR":
      return "SENIOR"
    default:
      return "STAFF"
  }
}

/** Nobody signed in (null) meets nothing. */
export function meetsTier(have: Tier | null | undefined, need: Tier): boolean {
  if (!have) return false
  return RANK[have] >= RANK[need]
}

export const SENIOR_PREFIXES = [
  "/kitchen/ordering",
  "/kitchen/order",
  "/kitchen/serves",
  "/kitchen/portions",
  "/kitchen/high-tea",
  "/kitchen/functions",
]

/**
 * The Managers area and Oliver's desk have their own password gates; the
 * tier decides whether the tile is offered at all. The other entries are
 * the managers pages that live outside /kitchen/managers (requireManager in
 * their page or layout) and the meeting deck route.
 */
export const MANAGER_PREFIXES = [
  "/kitchen/managers",
  "/kitchen/gm",
  "/kitchen/meeting",
  "/kitchen/prices",
  "/kitchen/lineup",
  "/kitchen/jobs",
  "/kitchen/commitments",
  "/kitchen/training",
]

function under(href: string, prefixes: string[]): boolean {
  return prefixes.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`))
}

/** The least tier that may open this href. */
export function tierForHref(href: string): Tier {
  if (under(href, MANAGER_PREFIXES)) return "MANAGER"
  if (under(href, SENIOR_PREFIXES)) return "SENIOR"
  return "STAFF"
}

/** Tiles this tier may see. Everything for OWNER; nothing for nobody. */
export function toolsForTier<T extends { href: string }>(tools: T[], tier: Tier | null): T[] {
  return tools.filter((t) => meetsTier(tier, tierForHref(t.href)))
}

/** Where someone lands when they open a page above their tier. */
export const TIER_LANDING = "/staffaccess"
