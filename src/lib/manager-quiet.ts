/**
 * Managers quiet list (Chloe, 11 Oct 2026).
 *
 * A manager who is working out their notice keeps the managers area and the
 * tools needed to run a shift, but the commercially sensitive parts are
 * withheld without anything on screen saying so: the tiles are simply not on
 * their grid, a direct link lands back on the Managers hub, the server
 * actions behind those pages refuse, and the line-up loses yesterday's take.
 *
 * AppSetting `managerQuietStaff` is a JSON array of strings. Each entry is
 * either a Tarte Shifts staff id or the person's full name as Shifts holds it
 * ("First Last", case and spacing ignored). The office login and the owner's
 * phone are never quiet. This file is the pure part so it can be unit tested;
 * the cookie and database reads are in manager-auth.ts.
 */

export const QUIET_SETTING_KEY = "managerQuietStaff"

/** Page prefixes withheld from a quiet manager. Tiles under them are hidden. */
export const QUIET_HIDDEN_PREFIXES = [
  "/kitchen/managers/sales",
  "/kitchen/managers/agenda",
  "/kitchen/managers/preferred",
  "/kitchen/prices",
  "/kitchen/training",
  "/kitchen/meeting",
]

/** Where a quiet manager lands when they open a withheld page directly. */
export const QUIET_LANDING = "/kitchen/managers"

export interface QuietPerson {
  id: string
  name: string
}

function normalise(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * The stored list, or null when the row is missing or unreadable. Callers
 * must treat null-from-unreadable as "everyone is quiet": a broken list
 * fails closed, the same rule as the allow list in manager-auth.
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

/** True when the signed-in person is on the quiet list. */
export function isQuietPerson(raw: string | null | undefined, person: QuietPerson | null): boolean {
  if (!person) return false
  const parsed = parseQuietList(raw)
  if (parsed === null) return false
  if ("broken" in parsed) return true
  const name = normalise(person.name)
  return parsed.list.some((entry) => entry === person.id || normalise(entry) === name)
}

export function isQuietHiddenHref(href: string): boolean {
  return QUIET_HIDDEN_PREFIXES.some((p) => href === p || href.startsWith(`${p}/`))
}

/** The tiles a person may see. Unchanged for anyone not quiet. */
export function visibleTools<T extends { href: string }>(tools: T[], quiet: boolean): T[] {
  return quiet ? tools.filter((t) => !isQuietHiddenHref(t.href)) : tools
}
