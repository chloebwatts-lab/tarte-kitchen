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
 *            portions, high tea, functions, and the Managers area (still
 *            behind its password and allow list)
 *   MANAGER  plus the meeting deck, costs and the till login
 *   OWNER    everything; the office login and the owner's phone
 *
 * Pages under a prefix below need at least that tier; anything not listed
 * is STAFF. Enforced in the data layer (assertTier in the actions) as well
 * as on the page, so numbers a tier may not see never reach the browser.
 * This file is the pure part so it can be unit tested; cookie reads are in
 * tier-auth.ts.
 */

import type { PersonRole } from "@/lib/person-auth"
import { personMatches, type MatchPerson } from "@/lib/access/match"

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
  // Every chef places their section's order (Chloe, 12 Oct), so /kitchen/order
  // itself is open; the end-of-day sheet with supplier emails is Senior.
  "/kitchen/order/sheet",
  "/kitchen/serves",
  "/kitchen/portions",
  "/kitchen/high-tea",
  "/kitchen/functions",
]

/**
 * Kitchen-side tier overrides (Chloe, 12 Oct 2026). AppSetting `tierOverrides`
 * is a JSON object of list entry (see access/match.ts) to tier. An override
 * can only raise someone: Shifts stays the base, and a person Shifts already
 * calls Manager is never lowered by a stale entry here.
 */
export const TIER_OVERRIDES_KEY = "tierOverrides"

/** An override can grant up to Manager. Owner is the office login and the owner's phone only. */
const OVERRIDABLE: Tier[] = ["STAFF", "SENIOR", "MANAGER"]

export function parseTierOverrides(raw: string | null | undefined): Record<string, Tier> {
  if (raw == null) return {}
  try {
    const v = JSON.parse(raw)
    if (!v || typeof v !== "object" || Array.isArray(v)) return {}
    const out: Record<string, Tier> = {}
    for (const [k, t] of Object.entries(v)) {
      if (typeof t === "string" && (OVERRIDABLE as string[]).includes(t)) out[k] = t as Tier
    }
    return out
  } catch {
    return {}
  }
}

export function tierWithOverrides(base: Tier, overrides: Record<string, Tier>, person: MatchPerson): Tier {
  let best = base
  for (const [entry, tier] of Object.entries(overrides)) {
    if (RANK[tier] > RANK[best] && personMatches(entry, person)) best = tier
  }
  return best
}

/**
 * The Managers area, behind its own password: Senior and up (Chloe, 16 Sep
 * 2026: supervisors get the managers password; reaffirmed 12 Oct). Listed
 * here so the tile is only offered from Senior; the password and the allow
 * list still decide inside. Includes the managers pages that live outside
 * /kitchen/managers (requireManager in their page or layout).
 */
export const MANAGERS_AREA_PREFIXES = [
  "/kitchen/managers",
  "/kitchen/prices",
  "/kitchen/lineup",
  "/kitchen/jobs",
  "/kitchen/commitments",
  "/kitchen/training",
]

/**
 * Manager and up: Oliver's desk (its own password) and the meeting deck
 * route, which is P&L and wages and sits above the Managers area.
 */
export const MANAGER_PREFIXES = ["/kitchen/gm", "/kitchen/meeting"]

function under(href: string, prefixes: string[]): boolean {
  return prefixes.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`))
}

/** The least tier that may open this href. */
export function tierForHref(href: string): Tier {
  if (under(href, MANAGER_PREFIXES)) return "MANAGER"
  if (under(href, SENIOR_PREFIXES) || under(href, MANAGERS_AREA_PREFIXES)) return "SENIOR"
  return "STAFF"
}

/** Tiles this tier may see. Everything for OWNER; nothing for nobody. */
export function toolsForTier<T extends { href: string }>(tools: T[], tier: Tier | null): T[] {
  return tools.filter((t) => meetsTier(tier, tierForHref(t.href)))
}

/** Where someone lands when they open a page above their tier. */
export const TIER_LANDING = "/staffaccess"
