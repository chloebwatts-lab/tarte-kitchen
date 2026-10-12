/**
 * Who is using Staff tools (Chloe, 12 Oct 2026). Pure summaries over the
 * access log (page views come from the StaffShell beacon, one row per page
 * open, with the person's name) and over the two ordering systems, so the
 * office page can answer "which managers are not using the tools" and
 * "are the Currumbin chefs ordering through the app". Database reads live
 * in data.ts.
 */

import { TOOL_GROUPS } from "@/lib/staff-tools"
import { personMatches } from "@/lib/access/match"

export interface ViewRow {
  staffId: string | null
  staffName: string | null
  path: string | null
  at: Date
}

export interface LoginRow {
  staffId: string | null
  staffName: string | null
  at: Date
}

/** Every tile, longest href first, so /kitchen/managers/sales beats /kitchen/managers. */
const TILES: { href: string; title: string }[] = TOOL_GROUPS.flatMap((g) => [
  ...(g.href ? [{ href: g.href, title: g.title }] : []),
  ...g.tools.map((t) => ({ href: t.href, title: t.title })),
])
  // The Checklists tile is /kitchen itself, which would swallow every page.
  .filter((t) => t.href !== "/kitchen")
  .sort((a, b) => b.href.length - a.href.length)

/** Checklist runs live under /kitchen/run and /kitchen/start. */
const CHECKLIST_PREFIXES = ["/kitchen/run", "/kitchen/start"]

/** Pages that are not tools in their own right. */
const SKIP = ["/staffaccess", "/staff-login", "/kitchen/confidentiality", "/kitchen/beacon", "/kitchen/managers/unlock", "/kitchen/gm/unlock"]

/** The tile a path belongs to, or null for the menus and sign-in pages. */
export function toolFor(path: string | null | undefined): string | null {
  if (!path) return null
  const p = path.split("?")[0].replace(/\/+$/, "") || "/"
  if (SKIP.some((s) => p === s || p.startsWith(`${s}/`))) return null
  if (p === "/kitchen" || CHECKLIST_PREFIXES.some((c) => p.startsWith(`${c}/`))) return "Checklists"
  if (p === "/kitchen/managers") return "Managers"
  if (p === "/kitchen/pastry") return "Pastry"
  const hit = TILES.find((t) => p === t.href || p.startsWith(`${t.href}/`))
  if (hit) return hit.title
  // Not a tile: name it by its first two segments so nothing is lost.
  const seg = p.split("/").filter(Boolean)
  return seg.length ? seg.slice(0, 2).join("/") : null
}

const BRIS = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane", year: "numeric", month: "2-digit", day: "2-digit" })

/** YYYY-MM-DD in Brisbane, so a 5 am open and a 9 pm close are one day. */
export function brisbaneDate(d: Date): string {
  return BRIS.format(d)
}

export interface PersonUsage {
  /** Staff id when the log has one, else the name. */
  key: string
  name: string
  logins: number
  lastLogin: Date | null
  /** Distinct Brisbane days with at least one page open. */
  daysActive: number
  lastSeen: Date | null
  views: number
  byTool: Record<string, number>
}

export function summarisePeople(views: ViewRow[], logins: LoginRow[]): PersonUsage[] {
  const people = new Map<string, PersonUsage & { days: Set<string> }>()
  const get = (id: string | null, name: string | null) => {
    const key = id || name || "unknown"
    let p = people.get(key)
    if (!p) {
      p = { key, name: name || key, logins: 0, lastLogin: null, daysActive: 0, lastSeen: null, views: 0, byTool: {}, days: new Set() }
      people.set(key, p)
    }
    return p
  }
  for (const v of views) {
    const tool = toolFor(v.path)
    if (!tool) continue
    const p = get(v.staffId, v.staffName)
    p.views++
    p.byTool[tool] = (p.byTool[tool] ?? 0) + 1
    p.days.add(brisbaneDate(v.at))
    if (!p.lastSeen || v.at > p.lastSeen) p.lastSeen = v.at
  }
  for (const l of logins) {
    const p = get(l.staffId, l.staffName)
    p.logins++
    if (!p.lastLogin || l.at > p.lastLogin) p.lastLogin = l.at
  }
  return [...people.values()]
    .map(({ days, ...p }) => ({ ...p, daysActive: days.size }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface WatchPerson {
  name: string
  venue: string | null
  role: string
}

/** The usage row for a watched name, matched the way the lists match (access/match.ts). */
export function usageFor(watch: WatchPerson, people: PersonUsage[]): PersonUsage | null {
  const hits = people.filter((p) => personMatches(watch.name, { id: p.key, name: p.name }))
  if (hits.length === 0) return null
  // Several rows for one person (a name and an id key): merge.
  return hits.reduce((acc, p) => ({
    key: acc.key,
    name: acc.name,
    logins: acc.logins + p.logins,
    lastLogin: later(acc.lastLogin, p.lastLogin),
    daysActive: Math.max(acc.daysActive, p.daysActive),
    lastSeen: later(acc.lastSeen, p.lastSeen),
    views: acc.views + p.views,
    byTool: mergeCounts(acc.byTool, p.byTool),
  }))
}

function later(a: Date | null, b: Date | null): Date | null {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

function mergeCounts(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out = { ...a }
  for (const [k, n] of Object.entries(b)) out[k] = (out[k] ?? 0) + n
  return out
}

/** Watched names from the team lists and the override list, one row each, first occurrence wins. */
export function watchList(
  team: { venue: string; name: string; role: string }[],
  overrides: Record<string, string>
): WatchPerson[] {
  const out: WatchPerson[] = []
  const seen = new Set<string>()
  const add = (w: WatchPerson) => {
    const k = w.name.trim().toLowerCase()
    if (!k || seen.has(k)) return
    seen.add(k)
    out.push(w)
  }
  for (const t of team) add({ name: t.name, venue: t.venue, role: t.role === "MANAGER" ? "Manager" : "Supervisor" })
  for (const [name, tier] of Object.entries(overrides)) {
    // "Lacey Corby" and "Lacey" both appear on the list; keep the fuller one.
    if (!name.includes(" ") && out.some((w) => w.name.toLowerCase().startsWith(`${name.toLowerCase()} `))) continue
    add({ name, venue: null, role: tier === "MANAGER" ? "Manager" : "Senior" })
  }
  return out
}

export interface OrderLineRow {
  venue: string
  dept: string
  requestDate: Date
  enteredBy: string | null
}

export interface OrderUsage {
  venue: string
  dept: string
  lines: number
  days: number
  people: string[]
  last: Date | null
}

export function summariseOrders(rows: OrderLineRow[]): OrderUsage[] {
  const m = new Map<string, OrderUsage & { dayset: Set<string>; who: Set<string> }>()
  for (const r of rows) {
    const k = `${r.venue}|${r.dept}`
    let o = m.get(k)
    if (!o) {
      o = { venue: r.venue, dept: r.dept, lines: 0, days: 0, people: [], last: null, dayset: new Set(), who: new Set() }
      m.set(k, o)
    }
    o.lines++
    o.dayset.add(brisbaneDate(r.requestDate))
    if (r.enteredBy?.trim()) o.who.add(r.enteredBy.trim())
    if (!o.last || r.requestDate > o.last) o.last = r.requestDate
  }
  return [...m.values()]
    .map(({ dayset, who, ...o }) => ({ ...o, days: dayset.size, people: [...who].sort() }))
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.dept.localeCompare(b.dept))
}

export interface RestockSheetRow {
  venue: string
  station: string
  sheetDate: Date
  countedBy: string | null
  submittedAt: Date | null
}

export interface RestockUsage {
  venue: string
  station: string
  sheets: number
  submitted: number
  people: string[]
  last: Date | null
}

export function summariseRestock(rows: RestockSheetRow[]): RestockUsage[] {
  const m = new Map<string, RestockUsage & { who: Set<string> }>()
  for (const r of rows) {
    const k = `${r.venue}|${r.station}`
    let o = m.get(k)
    if (!o) {
      o = { venue: r.venue, station: r.station, sheets: 0, submitted: 0, people: [], last: null, who: new Set() }
      m.set(k, o)
    }
    o.sheets++
    if (r.submittedAt) o.submitted++
    if (r.countedBy?.trim()) o.who.add(r.countedBy.trim())
    if (!o.last || r.sheetDate > o.last) o.last = r.sheetDate
  }
  return [...m.values()]
    .map(({ who, ...o }) => ({ ...o, people: [...who].sort() }))
    .sort((a, b) => a.venue.localeCompare(b.venue) || a.station.localeCompare(b.station))
}
