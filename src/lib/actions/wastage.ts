"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import Decimal from "decimal.js"
import { Venue, WasteReason } from "@/generated/prisma"

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
  reason: WasteReason
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
      reason: input.reason,
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
      ...e,
      quantity: Number(e.quantity),
      estimatedCost: Number(e.estimatedCost),
      date: e.date.toISOString().split("T")[0],
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

export interface WasteStats {
  totalWasteCost: number
  totalWasteCostLastWeek: number
  wastePercentOfRevenue: number
  byVenue: { venue: string; cost: number }[]
  topWastedItem: { name: string; cost: number } | null
  weekOverWeekChange: number // percentage change
  alertLevel: "green" | "amber" | "red"
  byReason: { reason: string; cost: number; count: number }[]
  dailyByVenue: { date: string; BURLEIGH: number; CURRUMBIN: number }[]
  weeklyTrend: { week: string; wastePercent: number }[]
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

  // By venue
  const byVenueMap = new Map<string, number>()
  for (const e of thisWeekEntries) {
    byVenueMap.set(e.venue, (byVenueMap.get(e.venue) ?? 0) + Number(e.estimatedCost))
  }
  const byVenue = Array.from(byVenueMap.entries()).map(([v, cost]) => ({
    venue: v,
    cost: Math.round(cost * 100) / 100,
  }))

  // Top wasted item
  const itemCosts = new Map<string, number>()
  for (const e of thisWeekEntries) {
    itemCosts.set(e.itemName, (itemCosts.get(e.itemName) ?? 0) + Number(e.estimatedCost))
  }
  let topWastedItem: { name: string; cost: number } | null = null
  let maxCost = 0
  for (const [name, cost] of itemCosts) {
    if (cost > maxCost) {
      maxCost = cost
      topWastedItem = { name, cost: Math.round(cost * 100) / 100 }
    }
  }

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

  // Daily by venue (last 30 days)
  const dailyMap = new Map<string, { BURLEIGH: number; CURRUMBIN: number }>()
  for (const e of last30DaysEntries) {
    const dateKey = e.date.toISOString().split("T")[0]
    const existing = dailyMap.get(dateKey) ?? { BURLEIGH: 0, CURRUMBIN: 0 }
    if (e.venue === "BURLEIGH" || e.venue === "CURRUMBIN") {
      existing[e.venue] += Number(e.estimatedCost)
    }
    dailyMap.set(dateKey, existing)
  }
  const dailyByVenue = Array.from(dailyMap.entries())
    .map(([date, data]) => ({
      date,
      BURLEIGH: Math.round(data.BURLEIGH * 100) / 100,
      CURRUMBIN: Math.round(data.CURRUMBIN * 100) / 100,
    }))
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

  return {
    totalWasteCost: Math.round(totalWasteCost * 100) / 100,
    totalWasteCostLastWeek: Math.round(totalWasteCostLastWeek * 100) / 100,
    wastePercentOfRevenue: Math.round(wastePercentOfRevenue * 100) / 100,
    byVenue,
    topWastedItem,
    weekOverWeekChange: Math.round(weekOverWeekChange * 100) / 100,
    alertLevel,
    byReason,
    dailyByVenue,
    weeklyTrend,
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

  // Rule 1: Item waste > 5% of sales volume
  const itemWasteQty = new Map<string, { waste: number; venue: string }>()
  for (const e of wasteEntries) {
    const key = `${e.itemName}|${e.venue}`
    const existing = itemWasteQty.get(key) ?? { waste: 0, venue: e.venue }
    existing.waste += Number(e.estimatedCost)
    itemWasteQty.set(key, existing)
  }
  const itemSalesRevenue = new Map<string, number>()
  for (const s of salesData) {
    const key = `${s.menuItemName}|${s.venue}`
    itemSalesRevenue.set(key, (itemSalesRevenue.get(key) ?? 0) + Number(s.revenue))
  }
  for (const [key, data] of itemWasteQty) {
    const salesRev = itemSalesRevenue.get(key) ?? 0
    if (salesRev > 0) {
      const wastePct = (data.waste / salesRev) * 100
      if (wastePct > 5) {
        const [itemName, venue] = key.split("|")
        insights.push({
          icon: "circle-alert",
          message: `${itemName} waste is ${wastePct.toFixed(1)}% of sales at ${venue} — review production quantities`,
          estimatedImpact: data.waste,
        })
      }
    }
  }

  // Rule 2: Venue comparison — one venue wastes 2x+ more
  const venueItemWaste = new Map<string, { BURLEIGH: number; CURRUMBIN: number }>()
  for (const e of wasteEntries) {
    const existing = venueItemWaste.get(e.itemName) ?? { BURLEIGH: 0, CURRUMBIN: 0 }
    if (e.venue === "BURLEIGH" || e.venue === "CURRUMBIN") {
      existing[e.venue] += Number(e.estimatedCost)
    }
    venueItemWaste.set(e.itemName, existing)
  }
  for (const [item, data] of venueItemWaste) {
    if (data.BURLEIGH > 0 && data.CURRUMBIN > 0) {
      const ratio = data.BURLEIGH / data.CURRUMBIN
      if (ratio >= 2) {
        insights.push({
          icon: "triangle-alert",
          message: `${item} waste at Burleigh is ${ratio.toFixed(1)}x higher than Currumbin — investigate`,
          estimatedImpact: data.BURLEIGH - data.CURRUMBIN,
        })
      } else if (1 / ratio >= 2) {
        insights.push({
          icon: "triangle-alert",
          message: `${item} waste at Currumbin is ${(1 / ratio).toFixed(1)}x higher than Burleigh — investigate`,
          estimatedImpact: data.CURRUMBIN - data.BURLEIGH,
        })
      }
    }
  }

  // Rule 3: Day-of-week pattern (50%+ above average)
  const dayWaste = new Map<number, number[]>()
  for (const e of wasteEntries) {
    const day = e.date.getDay()
    const existing = dayWaste.get(day) ?? []
    existing.push(Number(e.estimatedCost))
    dayWaste.set(day, existing)
  }
  const allDayCosts = Array.from(dayWaste.values()).flat()
  const avgDailyCost = allDayCosts.length > 0 ? allDayCosts.reduce((a, b) => a + b, 0) / allDayCosts.length : 0
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
  for (const [day, costs] of dayWaste) {
    const avgForDay = costs.reduce((a, b) => a + b, 0) / costs.length
    if (avgDailyCost > 0 && avgForDay > avgDailyCost * 1.5) {
      insights.push({
        icon: "calendar",
        message: `${dayNames[day]} consistently shows higher waste — consider adjusting ${dayNames[day]} prep`,
        estimatedImpact: (avgForDay - avgDailyCost) * 4, // monthly impact
      })
    }
  }

  // Rule 4: Trending up for 3+ consecutive weeks
  const weeklyWaste = new Map<string, number>()
  for (const e of wasteEntries) {
    const weekStart = getWeekStart(e.date)
    weeklyWaste.set(weekStart, (weeklyWaste.get(weekStart) ?? 0) + Number(e.estimatedCost))
  }
  const sortedWeeks = Array.from(weeklyWaste.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  if (sortedWeeks.length >= 3) {
    let consecutiveUp = 0
    for (let i = 1; i < sortedWeeks.length; i++) {
      if (sortedWeeks[i][1] > sortedWeeks[i - 1][1]) {
        consecutiveUp++
      } else {
        consecutiveUp = 0
      }
    }
    if (consecutiveUp >= 2) {
      const firstVal = sortedWeeks[sortedWeeks.length - consecutiveUp - 1][1]
      const lastVal = sortedWeeks[sortedWeeks.length - 1][1]
      insights.push({
        icon: "trending-up",
        message: `Waste trending up for ${consecutiveUp + 1} weeks — was $${firstVal.toFixed(0)}, now $${lastVal.toFixed(0)}`,
        estimatedImpact: lastVal - firstVal,
      })
    }
  }

  // Rule 5: Overproduction > 50% of total waste
  const totalWaste = wasteEntries.reduce((sum, e) => sum + Number(e.estimatedCost), 0)
  const overproductionWaste = wasteEntries
    .filter((e) => e.reason === "OVERPRODUCTION")
    .reduce((sum, e) => sum + Number(e.estimatedCost), 0)
  if (totalWaste > 0 && overproductionWaste / totalWaste > 0.5) {
    insights.push({
      icon: "sandwich",
      message: `Overproduction is your #1 waste category (${((overproductionWaste / totalWaste) * 100).toFixed(0)}%) — review par levels and prep forecasts`,
      estimatedImpact: overproductionWaste,
    })
  }

  // Sort by estimated impact, limit to 5
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

  const header = "Date,Venue,Item,Quantity,Unit,Cost,Reason,Notes,Recorded By"
  const rows = entries.map((e) => {
    const date = e.date.toISOString().split("T")[0]
    const notes = (e.notes ?? "").replace(/"/g, '""')
    return `${date},${e.venue},"${e.itemName}",${Number(e.quantity)},${e.unit},${Number(e.estimatedCost)},${e.reason},"${notes}","${e.recordedBy ?? ""}"`
  })

  return [header, ...rows].join("\n")
}

// ============================================================
// ITEMS FOR WASTE FORM DROPDOWN
// ============================================================

export async function getWasteFormItems() {
  const [dishes, ingredients] = await Promise.all([
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
      },
      orderBy: { name: "asc" },
    }),
  ])

  return {
    dishes: dishes.map((d) => ({
      id: d.id,
      name: d.name,
      venue: d.venue,
      costPerUnit: Number(d.totalCost),
      type: "dish" as const,
      category: d.menuCategory,
    })),
    ingredients: ingredients.map((i) => {
      // Cost per base unit for ingredients
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
      }
    }),
  }
}
