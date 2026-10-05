import { ONLINE_ID, matchHours } from "@/lib/sales/upsell"

/**
 * The simple challenge board (Chloe, 5 Oct 2026): one list of people, how
 * many sides each sold, and sides per hour worked. Managers are salaried
 * and always work nine-hour days, so they count 9 hours for every day they
 * sold on, whatever the timesheet says.
 */
export const MANAGER_DAY_HOURS = 9
/** Hours someone needs in the week before their per-hour number is ranked. */
export const WEEK_MIN_HOURS = 8

/** Early in the week nobody has 8 hours yet: 4 on day one, 8 from day two. */
export function weekMinHours(daysSoFar: number): number {
  return Math.min(WEEK_MIN_HOURS, 4 * Math.max(1, daysSoFar))
}

export interface DayRow {
  date: string
  teamMemberId: string
  staffName: string
  units: number
  eligibleOrders: number
  breakdown: Record<string, number> | null
}

export interface SimpleRow {
  id: string
  name: string
  units: number
  hours: number | null
  perHour: number | null
  manager: boolean
  rank: number | null
  items: Array<{ name: string; units: number }>
}

export interface SimpleBoard {
  rows: SimpleRow[]
  teamUnits: number
  /** Sides on online orders: counted for the team, nobody's name on them. */
  onlineUnits: number
}

const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/** Rank by sides sold (a day) or by sides per hour (the week). */
export function buildSimpleBoard(
  rows: DayRow[],
  timesheetHours: Map<string, number>,
  managerNames: string[],
  by: "UNITS" | "PER_HOUR",
  minHours = WEEK_MIN_HOURS
): SimpleBoard {
  const managers = new Set(managerNames.map(key))
  const people = new Map<string, { name: string; units: number; days: Set<string>; items: Map<string, number> }>()
  let onlineUnits = 0
  for (const r of rows) {
    if (r.teamMemberId === ONLINE_ID) { onlineUnits += r.units; continue }
    const p = people.get(r.teamMemberId) ?? { name: r.staffName, units: 0, days: new Set<string>(), items: new Map<string, number>() }
    p.units += r.units
    if (r.eligibleOrders > 0 || r.units > 0) p.days.add(r.date)
    for (const [name, n] of Object.entries(r.breakdown ?? {})) p.items.set(name, (p.items.get(name) ?? 0) + Number(n || 0))
    people.set(r.teamMemberId, p)
  }
  const clocked = matchHours([...people.values()].map((p) => p.name), timesheetHours)

  const out: SimpleRow[] = [...people.entries()].map(([id, p]) => {
    const manager = managers.has(key(p.name))
    const raw = manager ? p.days.size * MANAGER_DAY_HOURS : clocked.get(p.name) ?? null
    const hours = raw !== null && raw > 0 ? Math.round(raw * 10) / 10 : null
    return {
      id, name: p.name, units: p.units, hours, manager, rank: null,
      perHour: hours ? Math.round((p.units / hours) * 100) / 100 : null,
      items: [...p.items.entries()].map(([name, units]) => ({ name, units })).filter((i) => i.units > 0).sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)),
    }
  })

  const ranked = (r: SimpleRow) => (by === "UNITS" ? r.units > 0 : r.perHour !== null && (r.hours ?? 0) >= minHours && r.units > 0)
  const score = (r: SimpleRow) => (by === "UNITS" ? r.units : ranked(r) ? r.perHour! : -1)
  out.sort((a, b) => score(b) - score(a) || b.units - a.units || a.name.localeCompare(b.name))
  let rank = 0, last: number | null = null
  out.forEach((r, i) => {
    if (!ranked(r)) return
    if (score(r) !== last) { rank = i + 1; last = score(r) }
    r.rank = rank
  })
  return { rows: out, teamUnits: out.reduce((n, r) => n + r.units, 0) + onlineUnits, onlineUnits }
}
