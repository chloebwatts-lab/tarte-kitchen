"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import { Venue, WasteReason } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL, type SingleVenue } from "@/lib/venues"

// ============================================================
// WASTE ENTRY CRUD
// ============================================================

export interface CreateWasteEntryInput {
  date: string // ISO date
  venue: Venue
  dishId?: string | null
  ingredientId?: string | null
  itemName: string
  quantity: number
  unit: string
  reason?: WasteReason
  estimatedCost: number
  notes?: string | null
  recordedBy?: string | null
}

export async function createWasteEntry(input: CreateWasteEntryInput) {
  await db.wasteEntry.create({
    data: {
      date: new Date(input.date),
      venue: input.venue,
      dishId: input.dishId ?? null,
      ingredientId: input.ingredientId ?? null,
      itemName: input.itemName,
      quantity: input.quantity,
      unit: input.unit,
      reason: input.reason ?? "OTHER",
      estimatedCost: input.estimatedCost,
      notes: input.notes ?? null,
      recordedBy: input.recordedBy ?? null,
    },
  })
  revalidatePath("/wastage")
}

export interface WasteFilters {
  venue?: Venue
  reason?: WasteReason
  dateFrom?: string
  dateTo?: string
  search?: string
  page?: number
  pageSize?: number
}

export async function getWasteEntries(filters: WasteFilters = {}) {
  const { venue, reason, dateFrom, dateTo, search, page = 1, pageSize = 20 } = filters

  const where: Record<string, unknown> = {}
  if (venue) where.venue = venue
  if (reason) where.reason = reason
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
  }
  if (search) {
    where.itemName = { contains: search, mode: "insensitive" }
  }

  const [entries, total] = await Promise.all([
    db.wasteEntry.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.wasteEntry.count({ where }),
  ])

  return {
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString().split("T")[0],
      venue: e.venue,
      itemName: e.itemName,
      quantity: Number(e.quantity),
      unit: e.unit,
      reason: e.reason,
      estimatedCost: Number(e.estimatedCost),
      notes: e.notes,
      recordedBy: e.recordedBy,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ============================================================
// WASTE STATS (KPIs)
// ============================================================

export interface PerVenueWaste {
  venue: SingleVenue
  label: string
  wasteCost: number
  revenueExGst: number
  wastePercent: number
  wasteCostLastWeek: number
  wastePercentLastWeek: number
  weekOverWeekChange: number
  topSellerRevenue: number
  wasteToTopSellerRatio: number // wasteCost / topSellerRevenue
}

export interface CogsImpact {
  weekLabel: string // e.g. "w/e 21 Apr"
  totalCogs: number
  wasteCost: number
  wasteAsPctOfCogs: number
  perVenue: { venue: SingleVenue; wasteCost: number; weekCogs: number; wasteAsPctOfCogs: number }[]
}

export interface WasteStats {
  totalWasteCost: number
  totalWasteCostLastWeek: number
  wastePercentOfRevenue: number
  revenueThisWeekExGst: number
  byVenue: { venue: string; cost: number }[]
  perVenue: PerVenueWaste[]
  topWastedItem: { name: string; cost: number } | null
  topWastedItems: { name: string; cost: number; count: number }[]
  weekOverWeekChange: number // percentage change
  alertLevel: "green" | "amber" | "red"
  byReason: { reason: string; cost: number; count: number }[]
  byDayOfWeek: { day: string; cost: number }[]
  dailyByVenue: ({ date: string } & Record<SingleVenue, number>)[]
  weeklyTrend: { week: string; wastePercent: number }[]
  cogsImpact: CogsImpact | null
}

export async function getWasteStats(
  venue?: Venue
): Promise<WasteStats> {
  const now = new Date()
  const thisWeekStart = new Date(now)
  thisWeekStart.setDate(now.getDate() - now.getDay()) // Sunday
  thisWeekStart.setHours(0, 0, 0, 0)

  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(lastWeekStart.getDate() - 7)

  const thirtyDaysAgo = new Date(now)
  thirtyDaysAgo.setDate(now.getDate() - 30)

  const twelveWeeksAgo = new Date(now)
  twelveWeeksAgo.setDate(now.getDate() - 84)

  const venueFilter = venue ? { venue } : {}

  // Fetch all data in parallel
  const [
    thisWeekEntries,
    lastWeekEntries,
    last30DaysEntries,
    last12WeeksEntries,
    revenueSummaries,
    revenueThisWeek,
    revenueLastWeek,
    topSellersThisWeek,
  ] = await Promise.all([
    db.wasteEntry.findMany({
      where: { ...venueFilter, date: { gte: thisWeekStart } },
    }),
    db.wasteEntry.findMany({
      where: {
        ...venueFilter,
        date: { gte: lastWeekStart, lt: thisWeekStart },
      },
    }),
    db.wasteEntry.findMany({
      where: { ...venueFilter, date: { gte: thirtyDaysAgo } },
    }),
    db.wasteEntry.findMany({
      where: { ...venueFilter, date: { gte: twelveWeeksAgo } },
    }),
    db.dailySalesSummary.findMany({
      where: { ...venueFilter, date: { gte: twelveWeeksAgo } },
    }),
    db.dailySalesSummary.findMany({
      where: { ...venueFilter, date: { gte: thisWeekStart } },
    }),
    db.dailySalesSummary.findMany({
      where: { ...venueFilter, date: { gte: lastWeekStart, lt: thisWeekStart } },
    }),
    db.dailySales.groupBy({
      by: ["venue", "menuItemName"],
      where: { ...venueFilter, date: { gte: thisWeekStart } },
      _sum: { revenue: true, quantitySold: true },
      orderBy: { _sum: { revenue: "desc" } },
      take: 30,
    }),
  ])

  // Total waste cost this week
  const totalWasteCost = thisWeekEntries.reduce(
    (sum, e) => sum + Number(e.estimatedCost),
    0
  )

  const totalWasteCostLastWeek = lastWeekEntries.reduce(
    (sum, e) => sum + Number(e.estimatedCost),
    0
  )

  // Revenue this week for % calc
  const revenueThisWeekTotal = revenueThisWeek.reduce(
    (sum, s) => sum + Number(s.totalRevenueExGst),
    0
  )

  const wastePercentOfRevenue =
    revenueThisWeekTotal > 0
      ? (totalWasteCost / revenueThisWeekTotal) * 100
      : 0

  // By venue (simple legacy — kept for existing KPI card)
  const byVenueMap = new Map<string, number>()
  for (const e of thisWeekEntries) {
    byVenueMap.set(e.venue, (byVenueMap.get(e.venue) ?? 0) + Number(e.estimatedCost))
  }
  const byVenue = Array.from(byVenueMap.entries()).map(([v, cost]) => ({
    venue: v,
    cost: Math.round(cost * 100) / 100,
  }))

  // Per-venue waste with revenue context (3-venue breakdown)
  const wasteThisWeekByVenue = new Map<SingleVenue, number>()
  const wasteLastWeekByVenue = new Map<SingleVenue, number>()
  const revenueThisWeekByVenue = new Map<SingleVenue, number>()
  const revenueLastWeekByVenue = new Map<SingleVenue, number>()

  for (const e of thisWeekEntries) {
    if ((SINGLE_VENUES as readonly string[]).includes(e.venue)) {
      const v = e.venue as SingleVenue
      wasteThisWeekByVenue.set(v, (wasteThisWeekByVenue.get(v) ?? 0) + Number(e.estimatedCost))
    }
  }
  for (const e of lastWeekEntries) {
    if ((SINGLE_VENUES as readonly string[]).includes(e.venue)) {
      const v = e.venue as SingleVenue
      wasteLastWeekByVenue.set(v, (wasteLastWeekByVenue.get(v) ?? 0) + Number(e.estimatedCost))
    }
  }
  for (const s of revenueThisWeek) {
    if ((SINGLE_VENUES as readonly string[]).includes(s.venue)) {
      const v = s.venue as SingleVenue
      revenueThisWeekByVenue.set(
        v,
        (revenueThisWeekByVenue.get(v) ?? 0) + Number(s.totalRevenueExGst)
      )
    }
  }
  for (const s of revenueLastWeek) {
    if ((SINGLE_VENUES as readonly string[]).includes(s.venue)) {
      const v = s.venue as SingleVenue
      revenueLastWeekByVenue.set(
        v,
        (revenueLastWeekByVenue.get(v) ?? 0) + Number(s.totalRevenueExGst)
      )
    }
  }

  const topSellerByVenue = new Map<SingleVenue, number>()
  for (const row of topSellersThisWeek) {
    if ((SINGLE_VENUES as readonly string[]).includes(row.venue)) {
      const v = row.venue as SingleVenue
      const rev = Number(row._sum.revenue ?? 0)
      if (rev > (topSellerByVenue.get(v) ?? 0)) {
        topSellerByVenue.set(v, rev)
      }
    }
  }

  const perVenue: PerVenueWaste[] = SINGLE_VENUES.map((v) => {
    const wasteCost = wasteThisWeekByVenue.get(v) ?? 0
    const revenueExGst = revenueThisWeekByVenue.get(v) ?? 0
    const wasteCostLastWeek = wasteLastWeekByVenue.get(v) ?? 0
    const revenueLastWeekExGst = revenueLastWeekByVenue.get(v) ?? 0
    const wastePercent = revenueExGst > 0 ? (wasteCost / revenueExGst) * 100 : 0
    const wastePercentLastWeek =
      revenueLastWeekExGst > 0 ? (wasteCostLastWeek / revenueLastWeekExGst) * 100 : 0
    const weekOverWeekChange =
      wasteCostLastWeek > 0 ? ((wasteCost - wasteCostLastWeek) / wasteCostLastWeek) * 100 : 0
    const topSellerRevenue = topSellerByVenue.get(v) ?? 0
    const wasteToTopSellerRatio = topSellerRevenue > 0 ? wasteCost / topSellerRevenue : 0
    return {
      venue: v,
      label: VENUE_SHORT_LABEL[v],
      wasteCost: Math.round(wasteCost * 100) / 100,
      revenueExGst: Math.round(revenueExGst * 100) / 100,
      wastePercent: Math.round(wastePercent * 100) / 100,
      wasteCostLastWeek: Math.round(wasteCostLastWeek * 100) / 100,
      wastePercentLastWeek: Math.round(wastePercentLastWeek * 100) / 100,
      weekOverWeekChange: Math.round(weekOverWeekChange * 100) / 100,
      topSellerRevenue: Math.round(topSellerRevenue * 100) / 100,
      wasteToTopSellerRatio: Math.round(wasteToTopSellerRatio * 100) / 100,
    }
  })

  // Top wasted items (ranked list)
  const itemStats = new Map<string, { cost: number; count: number }>()
  for (const e of thisWeekEntries) {
    const s = itemStats.get(e.itemName) ?? { cost: 0, count: 0 }
    s.cost += Number(e.estimatedCost)
    s.count++
    itemStats.set(e.itemName, s)
  }
  const topWastedItems = Array.from(itemStats.entries())
    .map(([name, { cost, count }]) => ({ name, cost: Math.round(cost * 100) / 100, count }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 8)
  const topWastedItem = topWastedItems[0] ?? null

  // Week over week change
  const weekOverWeekChange =
    totalWasteCostLastWeek > 0
      ? ((totalWasteCost - totalWasteCostLastWeek) / totalWasteCostLastWeek) * 100
      : 0

  // Alert level
  let alertLevel: "green" | "amber" | "red" = "green"
  if (wastePercentOfRevenue >= 2.5) alertLevel = "red"
  else if (wastePercentOfRevenue >= 1.5) alertLevel = "amber"

  // By reason
  const reasonMap = new Map<string, { cost: number; count: number }>()
  for (const e of thisWeekEntries) {
    const existing = reasonMap.get(e.reason) ?? { cost: 0, count: 0 }
    existing.cost += Number(e.estimatedCost)
    existing.count += 1
    reasonMap.set(e.reason, existing)
  }
  const byReason = Array.from(reasonMap.entries()).map(([reason, data]) => ({
    reason,
    cost: Math.round(data.cost * 100) / 100,
    count: data.count,
  }))

  // By day of week (last 30 days, Mon–Sun order)
  const DOW_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const dayWasteMap = new Map<number, number>()
  for (const e of last30DaysEntries) {
    const day = e.date.getDay()
    dayWasteMap.set(day, (dayWasteMap.get(day) ?? 0) + Number(e.estimatedCost))
  }
  const byDayOfWeek = [1, 2, 3, 4, 5, 6, 0].map((d) => ({
    day: DOW_NAMES[d],
    cost: Math.round((dayWasteMap.get(d) ?? 0) * 100) / 100,
  }))

  // Daily by venue (last 30 days) — 3-venue stacked bar
  const emptyVenueRow = () =>
    SINGLE_VENUES.reduce(
      (acc, v) => ({ ...acc, [v]: 0 }),
      {} as Record<SingleVenue, number>
    )
  const dailyMap = new Map<string, Record<SingleVenue, number>>()
  for (const e of last30DaysEntries) {
    const dateKey = e.date.toISOString().split("T")[0]
    const existing = dailyMap.get(dateKey) ?? emptyVenueRow()
    if ((SINGLE_VENUES as readonly string[]).includes(e.venue)) {
      const v = e.venue as SingleVenue
      existing[v] += Number(e.estimatedCost)
    }
    dailyMap.set(dateKey, existing)
  }
  const dailyByVenue = Array.from(dailyMap.entries())
    .map(([date, data]) => {
      const rounded = SINGLE_VENUES.reduce(
        (acc, v) => ({ ...acc, [v]: Math.round(data[v] * 100) / 100 }),
        {} as Record<SingleVenue, number>
      )
      return { date, ...rounded }
    })
    .sort((a, b) => a.date.localeCompare(b.date))

  // Weekly trend (last 12 weeks)
  const weeklyWaste = new Map<string, number>()
  const weeklyRevenue = new Map<string, number>()
  for (const e of last12WeeksEntries) {
    const weekStart = getWeekStart(e.date)
    weeklyWaste.set(weekStart, (weeklyWaste.get(weekStart) ?? 0) + Number(e.estimatedCost))
  }
  for (const s of revenueSummaries) {
    const weekStart = getWeekStart(s.date)
    weeklyRevenue.set(weekStart, (weeklyRevenue.get(weekStart) ?? 0) + Number(s.totalRevenueExGst))
  }
  const weeklyTrend = Array.from(weeklyWaste.entries())
    .map(([week, waste]) => {
      const revenue = weeklyRevenue.get(week) ?? 0
      return {
        week,
        wastePercent: revenue > 0 ? Math.round((waste / revenue) * 10000) / 100 : 0,
      }
    })
    .sort((a, b) => a.week.localeCompare(b.week))

  // COGS impact — align wastage with the most recent WeeklyCogs Wed-week
  let cogsImpact: CogsImpact | null = null
  const latestCogsWeek = await db.weeklyCogs.findFirst({
    where: venueFilter,
    orderBy: { weekStartWed: "desc" },
    select: { weekStartWed: true },
  })
  if (latestCogsWeek) {
    const weekWed = latestCogsWeek.weekStartWed
    const weekEnd = new Date(weekWed)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const [cogsRows, cogsWeekWaste] = await Promise.all([
      db.weeklyCogs.findMany({ where: { ...venueFilter, weekStartWed: weekWed } }),
      db.wasteEntry.findMany({ where: { ...venueFilter, date: { gte: weekWed, lte: weekEnd } } }),
    ])

    const totalCogs = cogsRows.reduce((s, r) => s + Number(r.totalCogs), 0)
    const wasteByVenue = new Map<string, number>()
    for (const e of cogsWeekWaste) {
      wasteByVenue.set(e.venue, (wasteByVenue.get(e.venue) ?? 0) + Number(e.estimatedCost))
    }
    const totalWasteForCogs = Array.from(wasteByVenue.values()).reduce((s, v) => s + v, 0)

    const weekEndDate = new Date(weekWed)
    weekEndDate.setDate(weekEndDate.getDate() + 6)
    const weekLabel = `w/e ${weekEndDate.getDate()} ${weekEndDate.toLocaleString("en-AU", { month: "short" })}`

    if (totalCogs > 0) {
      cogsImpact = {
        weekLabel,
        totalCogs: Math.round(totalCogs * 100) / 100,
        wasteCost: Math.round(totalWasteForCogs * 100) / 100,
        wasteAsPctOfCogs: Math.round((totalWasteForCogs / totalCogs) * 10000) / 100,
        perVenue: cogsRows
          .filter((r) => (SINGLE_VENUES as readonly string[]).includes(r.venue))
          .map((r) => {
            const v = r.venue as SingleVenue
            const wasteCost = wasteByVenue.get(v) ?? 0
            const weekCogs = Number(r.totalCogs)
            return {
              venue: v,
              wasteCost: Math.round(wasteCost * 100) / 100,
              weekCogs: Math.round(weekCogs * 100) / 100,
              wasteAsPctOfCogs: weekCogs > 0 ? Math.round((wasteCost / weekCogs) * 10000) / 100 : 0,
            }
          }),
      }
    }
  }

  return {
    totalWasteCost: Math.round(totalWasteCost * 100) / 100,
    totalWasteCostLastWeek: Math.round(totalWasteCostLastWeek * 100) / 100,
    wastePercentOfRevenue: Math.round(wastePercentOfRevenue * 100) / 100,
    revenueThisWeekExGst: Math.round(revenueThisWeekTotal * 100) / 100,
    byVenue,
    perVenue,
    topWastedItem,
    topWastedItems,
    weekOverWeekChange: Math.round(weekOverWeekChange * 100) / 100,
    alertLevel,
    byReason,
    byDayOfWeek,
    dailyByVenue,
    weeklyTrend,
    cogsImpact,
  }
}

function getWeekStart(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split("T")[0]
}

// ============================================================
// AI SUGGESTIONS (rule-based insights)
// ============================================================

export interface WasteInsight {
  icon: string
  message: string
  estimatedImpact: number // $ cost
}

export async function getWasteInsights(): Promise<WasteInsight[]> {
  const now = new Date()
  const fourWeeksAgo = new Date(now)
  fourWeeksAgo.setDate(now.getDate() - 28)

  const [wasteEntries, salesData] = await Promise.all([
    db.wasteEntry.findMany({
      where: { date: { gte: fourWeeksAgo } },
    }),
    db.dailySales.findMany({
      where: { date: { gte: fourWeeksAgo } },
    }),
  ])

  const insights: WasteInsight[] = []
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

  // --- Rule 1: item wasted >5% of its own sales revenue ------------------
  // Actionable ask: cut its prep quantity by that %. Projected saving = the
  // waste cost itself.
  const itemWaste = new Map<string, { waste: number; venue: string; days: Set<number> }>()
  for (const e of wasteEntries) {
    const key = `${e.itemName}|${e.venue}`
    const existing = itemWaste.get(key) ?? { waste: 0, venue: e.venue, days: new Set<number>() }
    existing.waste += Number(e.estimatedCost)
    existing.days.add(e.date.getDay())
    itemWaste.set(key, existing)
  }
  const itemSalesRevenue = new Map<string, number>()
  for (const s of salesData) {
    const key = `${s.menuItemName}|${s.venue}`
    itemSalesRevenue.set(key, (itemSalesRevenue.get(key) ?? 0) + Number(s.revenue))
  }
  for (const [key, data] of itemWaste) {
    const salesRev = itemSalesRevenue.get(key) ?? 0
    if (salesRev > 0) {
      const wastePct = (data.waste / salesRev) * 100
      if (wastePct > 5) {
        const [itemName, venue] = key.split("|")
        const cutPct = Math.min(Math.round(wastePct - 2), 30)
        const venueLabel = VENUE_SHORT_LABEL[venue as SingleVenue] ?? venue
        insights.push({
          icon: "circle-alert",
          message:
            `${venueLabel}: cut ${itemName} prep by ~${cutPct}%. ` +
            `Wasting ${wastePct.toFixed(1)}% of what it sells ($${data.waste.toFixed(0)} over 4 weeks) — ` +
            `drop the daily prep target and retrain the next 7 days.`,
          estimatedImpact: data.waste,
        })
      }
    }
  }

  // --- Rule 2: a single item dominates one venue's waste -----------------
  // Surfaces the ONE item to focus on this week rather than a venue
  // comparison.
  const venueTotal = new Map<string, number>()
  const venueItem = new Map<string, { item: string; cost: number }>()
  for (const [key, data] of itemWaste) {
    const venue = data.venue
    venueTotal.set(venue, (venueTotal.get(venue) ?? 0) + data.waste)
    const prev = venueItem.get(venue)
    if (!prev || data.waste > prev.cost) {
      venueItem.set(venue, { item: key.split("|")[0], cost: data.waste })
    }
  }
  for (const [venue, top] of venueItem) {
    const tot = venueTotal.get(venue) ?? 0
    if (tot >= 50 && top.cost / tot >= 0.25) {
      const venueLabel = VENUE_SHORT_LABEL[venue as SingleVenue] ?? venue
      insights.push({
        icon: "triangle-alert",
        message:
          `${venueLabel}: ${top.item} is ${Math.round((top.cost / tot) * 100)}% of waste this month ($${top.cost.toFixed(0)}). ` +
          `Fixing this one item cuts your waste bill by a quarter — start here.`,
        estimatedImpact: top.cost,
      })
    }
  }

  // --- Rule 3: repeating day-of-week spike -------------------------------
  // If the same weekday is >50% above average, suggest shifting prep to
  // the next day or reducing Monday bake-off.
  const dayCost = new Map<number, { total: number; count: number }>()
  for (const e of wasteEntries) {
    const day = e.date.getDay()
    const existing = dayCost.get(day) ?? { total: 0, count: 0 }
    existing.total += Number(e.estimatedCost)
    existing.count += 1
    dayCost.set(day, existing)
  }
  const totalDays = Array.from(dayCost.values()).reduce((s, d) => s + d.count, 0)
  const grandTotal = Array.from(dayCost.values()).reduce((s, d) => s + d.total, 0)
  const avgPerDay = totalDays > 0 ? grandTotal / totalDays : 0
  for (const [day, { total, count }] of dayCost) {
    if (count === 0) continue
    const avgForDay = total / count
    if (avgPerDay > 0 && avgForDay > avgPerDay * 1.5) {
      const prev = dayNames[(day + 6) % 7]
      const monthly = (avgForDay - avgPerDay) * Math.max(1, count)
      insights.push({
        icon: "calendar",
        message:
          `${dayNames[day]}s waste ~$${avgForDay.toFixed(0)}/day — ${Math.round((avgForDay / avgPerDay - 1) * 100)}% above the weekly avg. ` +
          `Reduce ${prev} prep of the top 2 items so less carries into ${dayNames[day]}.`,
        estimatedImpact: monthly,
      })
    }
  }

  // --- Rule 4: waste trending up for 3+ consecutive weeks ---------------
  const weeklyWaste = new Map<string, number>()
  for (const e of wasteEntries) {
    const weekStart = getWeekStart(e.date)
    weeklyWaste.set(weekStart, (weeklyWaste.get(weekStart) ?? 0) + Number(e.estimatedCost))
  }
  const sortedWeeks = Array.from(weeklyWaste.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  if (sortedWeeks.length >= 3) {
    let consecutiveUp = 0
    for (let i = 1; i < sortedWeeks.length; i++) {
      if (sortedWeeks[i][1] > sortedWeeks[i - 1][1]) consecutiveUp++
      else consecutiveUp = 0
    }
    if (consecutiveUp >= 2) {
      const firstVal = sortedWeeks[sortedWeeks.length - consecutiveUp - 1][1]
      const lastVal = sortedWeeks[sortedWeeks.length - 1][1]
      const delta = lastVal - firstVal
      insights.push({
        icon: "trending-up",
        message:
          `Waste trending up ${consecutiveUp + 1} weeks running — $${firstVal.toFixed(0)} → $${lastVal.toFixed(0)}. ` +
          `Pull this week's top 3 wasted items into the next pre-service briefing and set a daily count.`,
        estimatedImpact: delta,
      })
    }
  }

  // --- Rule 5: overproduction dominates ---------------------------------
  const totalWaste = wasteEntries.reduce((sum, e) => sum + Number(e.estimatedCost), 0)
  const overproductionWaste = wasteEntries
    .filter((e) => e.reason === "OVERPRODUCTION")
    .reduce((sum, e) => sum + Number(e.estimatedCost), 0)
  if (totalWaste > 0 && overproductionWaste / totalWaste > 0.5) {
    insights.push({
      icon: "sandwich",
      message:
        `Overproduction = ${((overproductionWaste / totalWaste) * 100).toFixed(0)}% of waste ($${overproductionWaste.toFixed(0)}/4wk). ` +
        `Drop every par level by 10% for one week and review — if we still run out nothing, keep the new par.`,
      estimatedImpact: overproductionWaste,
    })
  }

  // --- Rule 6: spoilage/expired dominates --------------------------------
  const spoilWaste = wasteEntries
    .filter((e) => e.reason === "SPOILAGE" || e.reason === "EXPIRED")
    .reduce((sum, e) => sum + Number(e.estimatedCost), 0)
  if (totalWaste > 0 && spoilWaste / totalWaste > 0.3) {
    insights.push({
      icon: "triangle-alert",
      message:
        `Spoilage/expired is ${((spoilWaste / totalWaste) * 100).toFixed(0)}% of waste ($${spoilWaste.toFixed(0)}/4wk). ` +
        `Tighten order quantities on the biggest offenders + check FIFO labelling at the walk-in.`,
      estimatedImpact: spoilWaste,
    })
  }

  return insights
    .sort((a, b) => b.estimatedImpact - a.estimatedImpact)
    .slice(0, 5)
}

// ============================================================
// CSV EXPORT
// ============================================================

export async function exportWasteCsv(filters: WasteFilters = {}): Promise<string> {
  const { venue, reason, dateFrom, dateTo, search } = filters

  const where: Record<string, unknown> = {}
  if (venue) where.venue = venue
  if (reason) where.reason = reason
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) (where.date as Record<string, unknown>).gte = new Date(dateFrom)
    if (dateTo) (where.date as Record<string, unknown>).lte = new Date(dateTo)
  }
  if (search) {
    where.itemName = { contains: search, mode: "insensitive" }
  }

  const entries = await db.wasteEntry.findMany({
    where,
    orderBy: { date: "desc" },
  })

  // Build per-day per-venue revenue lookup so each row can carry waste % of revenue.
  // Key: `${date}|${venue}`.
  const revenueLookup = new Map<string, number>()
  if (entries.length > 0) {
    const minDate = entries[entries.length - 1].date
    const maxDate = entries[0].date
    const summaries = await db.dailySalesSummary.findMany({
      where: {
        date: { gte: minDate, lte: maxDate },
        ...(venue ? { venue } : {}),
      },
    })
    for (const s of summaries) {
      const key = `${s.date.toISOString().split("T")[0]}|${s.venue}`
      revenueLookup.set(key, Number(s.totalRevenueExGst))
    }
  }

  const header =
    "Date,Venue,Item,Quantity,Unit,Cost,Revenue (ex GST),Waste % of Revenue,Reason,Notes,Recorded By"
  const rows = entries.map((e) => {
    const date = e.date.toISOString().split("T")[0]
    const notes = (e.notes ?? "").replace(/"/g, '""')
    const rev = revenueLookup.get(`${date}|${e.venue}`) ?? 0
    const cost = Number(e.estimatedCost)
    const pct = rev > 0 ? ((cost / rev) * 100).toFixed(2) : ""
    return `${date},${e.venue},"${e.itemName}",${Number(e.quantity)},${e.unit},${cost},${rev},${pct},${e.reason},"${notes}","${e.recordedBy ?? ""}"`
  })

  return [header, ...rows].join("\n")
}

// ============================================================
// ITEMS FOR WASTE FORM DROPDOWN
// ============================================================

export async function getWasteFormItems() {
  // Frequency boost: items wasted often in the last 30 days should float to
  // the top of the search list so staff hit "Latte" etc. on the first letter.
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [dishes, ingredients, preps, recentWaste] = await Promise.all([
    db.dish.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        venue: true,
        totalCost: true,
        menuCategory: true,
      },
      orderBy: { name: "asc" },
    }),
    db.ingredient.findMany({
      select: {
        id: true,
        name: true,
        category: true,
        purchasePrice: true,
        baseUnitsPerPurchase: true,
        wastePercentage: true,
        baseUnitType: true,
        gramsPerUnit: true,
      },
      orderBy: { name: "asc" },
    }),
    db.preparation.findMany({
      select: {
        id: true,
        name: true,
        yieldUnit: true,
        costPerGram: true,
        costPerServe: true,
      },
      orderBy: { name: "asc" },
    }),
    db.wasteEntry.groupBy({
      by: ["itemName"],
      where: { date: { gte: thirtyDaysAgo } },
      _count: { itemName: true },
    }),
  ])

  const useCount = new Map<string, number>()
  for (const r of recentWaste) {
    useCount.set(r.itemName, r._count.itemName)
  }

  return {
    dishes: dishes.map((d) => ({
      id: d.id,
      name: d.name,
      venue: d.venue,
      costPerUnit: Number(d.totalCost),
      type: "dish" as const,
      category: d.menuCategory,
      recentUseCount: useCount.get(d.name) ?? 0,
    })),
    ingredients: ingredients.map((i) => {
      const price = new Decimal(i.purchasePrice)
      const baseUnits = new Decimal(i.baseUnitsPerPurchase)
      const wastePct = new Decimal(i.wastePercentage)
      const wasteFactor = new Decimal(1).minus(wastePct.div(100))
      const usable = baseUnits.mul(wasteFactor)
      const costPerBase = usable.isZero() ? 0 : Number(price.div(usable))

      return {
        id: i.id,
        name: i.name,
        costPerBaseUnit: costPerBase,
        type: "ingredient" as const,
        category: i.category,
        baseUnitType: i.baseUnitType,
        gramsPerUnit: i.gramsPerUnit != null ? Number(i.gramsPerUnit) : null,
        recentUseCount: useCount.get(i.name) ?? 0,
      }
    }),
    preps: preps.map((p) => ({
      id: p.id,
      name: p.name,
      yieldUnit: p.yieldUnit,
      costPerGram: Number(p.costPerGram),
      costPerServe: Number(p.costPerServe),
      type: "prep" as const,
      recentUseCount: useCount.get(p.name) ?? 0,
    })),
  }
}
