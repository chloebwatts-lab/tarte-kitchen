import { db } from "@/lib/db"
import { TIER_OVERRIDES_KEY, parseTierOverrides } from "@/lib/access/tiers"
import {
  summariseOrders,
  summarisePeople,
  summariseRestock,
  usageFor,
  watchList,
  type OrderUsage,
  type PersonUsage,
  type RestockUsage,
  type WatchPerson,
} from "./report"

export interface UsageReport {
  days: number
  since: Date
  /** Managers, supervisors and overridden seniors, with their usage or null. */
  watched: { who: WatchPerson; usage: PersonUsage | null }[]
  everyone: PersonUsage[]
  orders: OrderUsage[]
  restock: RestockUsage[]
  /** Page views in the window, before grouping. */
  totalViews: number
}

/** The usage page's data for the last `days` days. Office only; the caller gates. */
export async function getUsageReport(days: number): Promise<UsageReport> {
  const since = new Date(Date.now() - days * 86_400_000)
  const [views, logins, team, overridesRow, orderLines, sheets] = await Promise.all([
    db.accessEvent.findMany({
      where: { kind: "VIEW", at: { gte: since } },
      select: { staffId: true, staffName: true, path: true, at: true },
      orderBy: { at: "asc" },
      take: 100_000,
    }),
    db.accessEvent.findMany({
      where: { kind: "LOGIN", at: { gte: since } },
      select: { staffId: true, staffName: true, at: true },
      take: 20_000,
    }),
    db.venueTeamMember.findMany({
      where: { isActive: true },
      select: { venue: true, name: true, role: true },
      orderBy: [{ venue: "asc" }, { sortOrder: "asc" }],
    }),
    db.appSetting.findUnique({ where: { key: TIER_OVERRIDES_KEY } }),
    db.deptOrderLine.findMany({
      where: { request: { requestDate: { gte: since } } },
      select: { enteredBy: true, request: { select: { venue: true, dept: true, requestDate: true } } },
      take: 50_000,
    }),
    db.restockSheet.findMany({
      where: { sheetDate: { gte: since } },
      select: { venue: true, station: true, sheetDate: true, countedBy: true, submittedAt: true },
      take: 20_000,
    }),
  ])

  const everyone = summarisePeople(views, logins)
  const watch = watchList(team, parseTierOverrides(overridesRow?.value))
  return {
    days,
    since,
    watched: watch.map((who) => ({ who, usage: usageFor(who, everyone) })),
    everyone,
    orders: summariseOrders(orderLines.map((l) => ({ ...l.request, enteredBy: l.enteredBy }))),
    restock: summariseRestock(sheets),
    totalViews: views.length,
  }
}
