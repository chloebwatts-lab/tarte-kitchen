/**
 * Average sale leaderboard (Chloe, 9 Oct 2026: "I need to motivate them to
 * sell more"). One list per channel: who, their average paid sale, how many
 * sales. Ranked on average sale once someone has enough sales for the
 * number to mean something; below that they are listed unranked so the
 * person still sees their own figure.
 */

export type BoardChannel = "CAFE" | "RESTAURANT"

/** Sales someone needs before their average is ranked: a day, and a week. */
export const DAY_MIN_ORDERS = 10
export const WEEK_MIN_ORDERS = 25

/** Early in the week nobody has 25 yet: 10 on day one, then 5 more a day up to 25. */
export function weekMinOrders(daysSoFar: number): number {
  return Math.min(WEEK_MIN_ORDERS, DAY_MIN_ORDERS + 5 * Math.max(0, daysSoFar - 1))
}

export interface StaffSalesRow {
  date: string
  teamMemberId: string
  staffName: string
  channel: string
  sales: number
  orders: number
}

export interface AvgRow {
  id: string
  name: string
  sales: number
  orders: number
  avg: number
  rank: number | null
  /** Dollars above (+) or below (-) the team average. */
  vsTeam: number
}

export interface AvgBoard {
  channel: BoardChannel
  rows: AvgRow[]
  teamSales: number
  teamOrders: number
  teamAvg: number
  minOrders: number
}

const r2 = (n: number) => Math.round(n * 100) / 100

export function buildAvgBoard(rows: StaffSalesRow[], channel: BoardChannel, minOrders: number): AvgBoard {
  const people = new Map<string, { name: string; sales: number; orders: number }>()
  let teamSales = 0, teamOrders = 0
  for (const r of rows) {
    if (r.channel !== channel || r.orders <= 0) continue
    const p = people.get(r.teamMemberId) ?? { name: r.staffName, sales: 0, orders: 0 }
    p.sales += r.sales; p.orders += r.orders; p.name = r.staffName || p.name
    people.set(r.teamMemberId, p)
    teamSales += r.sales; teamOrders += r.orders
  }
  const teamAvg = teamOrders ? r2(teamSales / teamOrders) : 0
  const out: AvgRow[] = [...people.entries()].map(([id, p]) => {
    const avg = r2(p.sales / p.orders)
    return { id, name: p.name, sales: r2(p.sales), orders: p.orders, avg, rank: null, vsTeam: r2(avg - teamAvg) }
  })
  const ranked = (r: AvgRow) => r.orders >= minOrders
  out.sort((a, b) => Number(ranked(b)) - Number(ranked(a)) || b.avg - a.avg || b.orders - a.orders || a.name.localeCompare(b.name))
  let rank = 0, last: number | null = null
  out.forEach((r, i) => {
    if (!ranked(r)) return
    if (r.avg !== last) { rank = i + 1; last = r.avg }
    r.rank = rank
  })
  return { channel, rows: out, teamSales: r2(teamSales), teamOrders, teamAvg, minOrders }
}
