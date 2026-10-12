import { db } from "@/lib/db"
import { TIER_OVERRIDES_KEY, parseTierOverrides } from "@/lib/access/tiers"
import {
  brisbaneDate,
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
  /**
   * Override-list spellings that matched nobody in the log. The list often
   * carries two spellings for one person (Jess and Jessica, Vini and
   * Vinicius), so these are "no sign-in under this name", not "idle".
   */
  unmatchedAliases: string[]
  everyone: PersonUsage[]
  orders: OrderUsage[]
  restock: RestockUsage[]
  /** Page views in the window, before grouping. */
  totalViews: number
}

/** The usage page's data for the last `days` days. Office only; the caller gates. */
export async function getUsageReport(days: number): Promise<UsageReport> {
  // The window starts at a Brisbane midnight, so "14 days" is 14 whole days
  // for the date-only columns (requestDate, sheetDate sit at UTC midnight).
  const sinceDay = brisbaneDate(new Date(Date.now() - days * 86_400_000))
  const since = new Date(`${sinceDay}T00:00:00+10:00`)
  const sinceDate = new Date(`${sinceDay}T00:00:00Z`)
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
      where: { request: { requestDate: { gte: sinceDate } } },
      select: { enteredBy: true, request: { select: { venue: true, dept: true, requestDate: true } } },
      take: 50_000,
    }),
    db.restockSheet.findMany({
      where: { sheetDate: { gte: sinceDate } },
      select: { venue: true, station: true, sheetDate: true, countedBy: true, submittedAt: true },
      take: 20_000,
    }),
  ])

  const everyone = summarisePeople(views, logins)
  const watch = watchList(team, parseTierOverrides(overridesRow?.value))
  const all = watch.map((who) => ({ who, usage: usageFor(who, everyone) }))
  // Team-list names are real people at a venue: shown, idle or not. An
  // override spelling nobody has signed in under is listed separately.
  const watched = all.filter((w) => w.who.venue !== null || w.usage !== null)
  const unmatchedAliases = all.filter((w) => w.who.venue === null && w.usage === null).map((w) => w.who.name)
  return {
    days,
    since,
    watched,
    unmatchedAliases,
    everyone,
    orders: summariseOrders(orderLines.map((l) => ({ ...l.request, enteredBy: l.enteredBy }))),
    restock: summariseRestock(sheets),
    totalViews: views.length,
  }
}
