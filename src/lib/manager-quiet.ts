/**
 * Quiet lists (Chloe, 11 and 12 Oct 2026).
 *
 * A person on a quiet list keeps their tier and the tools needed to run a
 * shift, but named pages are withheld without anything on screen saying so:
 * the tiles are simply not on their grid, a direct link lands back where
 * they came from, and the server actions behind those pages refuse.
 *
 * Two lists, both AppSetting rows holding a JSON array of strings (a Shifts
 * staff id, a full name, or a first name on its own; see access/match.ts):
 *
 *   managerQuietStaff  a manager working out their notice: sales, supplier
 *                      prices, the agenda, training records, the meeting
 *                      deck and yesterday's take on the line-up go.
 *   copyQuietStaff     a senior who runs shifts but should not hold the
 *                      supplier map: where to buy and rep contacts, prep
 *                      yields, price check, the preferred supplier lookup.
 *
 * The office login and the owner's phone are never quiet. This file is the
 * pure part so it can be unit tested; the cookie and database reads are in
 * manager-auth.ts and tier-auth.ts.
 */

import { personMatches } from "@/lib/access/match"

export const QUIET_SETTING_KEY = "managerQuietStaff"
export const COPY_QUIET_SETTING_KEY = "copyQuietStaff"

/** Page prefixes withheld from a quiet manager. Tiles under them are hidden. */
export const QUIET_HIDDEN_PREFIXES = [
  "/kitchen/managers/sales",
  "/kitchen/managers/agenda",
  "/kitchen/managers/preferred",
  "/kitchen/prices",
  "/kitchen/training",
  "/kitchen/meeting",
]

/**
 * Page prefixes withheld from someone on the copy-quiet list: supplier reps
 * and contacts, prep yields, and what we pay. Chloe, 12 Oct: they keep the
 * order sheet, portions, high tea and functions.
 */
export const COPY_QUIET_PREFIXES = [
  "/kitchen/ordering",
  "/kitchen/serves",
  "/kitchen/prices",
  "/kitchen/managers/preferred",
]

/** Where a quiet manager lands when they open a withheld page directly. */
export const QUIET_LANDING = "/kitchen/managers"

export interface QuietPerson {
  id: string
  name: string
}

/**
 * The stored list, or null when the row is missing or unreadable. Callers
 * must treat broken as "everyone is quiet": a broken list fails closed, the
 * same rule as the allow list in manager-auth.
 */
export function parseQuietList(raw: string | null | undefined): { list: string[] } | { broken: true } | null {
  if (raw == null) return null
  try {
    const v = JSON.parse(raw)
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) return { broken: true }
    return { list: v }
  } catch {
    return { broken: true }
  }
}

/** True when the signed-in person is on the list held in `raw`. */
export function isQuietPerson(raw: string | null | undefined, person: QuietPerson | null): boolean {
  if (!person) return false
  const parsed = parseQuietList(raw)
  if (parsed === null) return false
  if ("broken" in parsed) return true
  return parsed.list.some((entry) => personMatches(entry, person))
}

function under(href: string, prefixes: string[]): boolean {
  return prefixes.some((p) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`))
}

export function isQuietHiddenHref(href: string): boolean {
  return under(href, QUIET_HIDDEN_PREFIXES)
}

export function isCopyQuietHref(href: string): boolean {
  return under(href, COPY_QUIET_PREFIXES)
}

/** The tiles a quiet manager may see. Unchanged for anyone not quiet. */
export function visibleTools<T extends { href: string }>(tools: T[], quiet: boolean): T[] {
  return quiet ? tools.filter((t) => !isQuietHiddenHref(t.href)) : tools
}

/** The tiles someone on the copy-quiet list may see. Unchanged otherwise. */
export function copyVisibleTools<T extends { href: string }>(tools: T[], copyQuiet: boolean): T[] {
  return copyQuiet ? tools.filter((t) => !isCopyQuietHref(t.href)) : tools
}
