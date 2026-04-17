"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

export interface AnalysisData {
  rangeDays: number
  venue: Venue | "ALL"
  revenueTrend: {
    date: string
    revenueExGst: number
    theoreticalCogs: number | null
    foodCostPct: number | null
  }[]
  grossMargin: { date: string; marginDollars: number; marginPct: number | null }[]
  basketSize: { date: string; averageSpend: number; covers: number }[]
  dowHeatmap: { dow: number; dowLabel: string; avgRevenue: number }[]
  bestSellerMovers: {
    name: string
    prevWeekQty: number
    thisWeekQty: number
    deltaPct: number
    thisWeekRevenue: number
  }[]
  underperformers: {
    name: string
    prev28dQty: number
    recent28dQty: number
    dropPct: number
  }[]
  menuMix: { menuCategory: string; revenue: number; pctOfTotal: number }[]
  labourPct:
    | { weekStart: string; labourCost: number; revenue: number; pctOfRevenue: number }[]
    | null
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

function startOfAestDay(offsetDays = 0): Date {
  const now = new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(now.getTime() + aestOffset)
  aestNow.setUTCHours(0, 0, 0, 0)
  aestNow.setUTCDate(aestNow.getUTCDate() - offsetDays)
  return new Date(aestNow.toISOString().split("T")[0])
}

export async function getAnalysisData(params: {
  venue: Venue | "ALL"
  rangeDays: number
}): Promise<AnalysisData> {
  const { venue, rangeDays } = params
  const start = startOfAestDay(rangeDays)
  const venueFilter: { venue?: { in: Venue[] } } =
    venue === "ALL"
      ? { venue: { in: [...SINGLE_VENUES] as Venue[] } }
      : { venue: { in: [venue] } }

  const summaries = await db.dailySalesSummary.findMany({
    where: { ...venueFilter, date: { gte: start } },
    orderBy: { date: "asc" },
  })

  // Group summaries by date (sum across venues when "ALL")
  const byDate = new Map<
    string,
    {
      revenueExGst: number
      theoreticalCogs: number | null
      covers: number
      averageSpend: number
    }
  >()
  for (const s of summaries) {
    const key = s.date.toISOString().split("T")[0]
    const existing =
      byDate.get(key) ?? {
        revenueExGst: 0,
        theoreticalCogs: null,
        covers: 0,
        averageSpend: 0,
      }
    existing.revenueExGst += Number(s.totalRevenueExGst)
    existing.covers += s.totalCovers
    if (s.theoreticalCogs) {
      existing.theoreticalCogs =
        (existing.theoreticalCogs ?? 0) + Number(s.theoreticalCogs)
    }
    byDate.set(key, existing)
  }

  const revenueTrend = Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      revenueExGst: Math.round(v.revenueExGst * 100) / 100,
      theoreticalCogs:
        v.theoreticalCogs !== null ? Math.round(v.theoreticalCogs * 100) / 100 : null,
      foodCostPct:
        v.theoreticalCogs !== null && v.revenueExGst > 0
          ? Math.round((v.theoreticalCogs / v.revenueExGst) * 10000) / 100
          : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const grossMargin = revenueTrend.map((row) => ({
    date: row.date,
    marginDollars:
      row.theoreticalCogs !== null
        ? Math.round((row.revenueExGst - row.theoreticalCogs) * 100) / 100
        : 0,
    marginPct:
      row.theoreticalCogs !== null && row.revenueExGst > 0
        ? Math.round(
            ((row.revenueExGst - row.theoreticalCogs) / row.revenueExGst) * 10000
          ) / 100
        : null,
  }))

  const basketSize = Array.from(byDate.entries())
    .map(([date, v]) => ({
      date,
      averageSpend:
        v.covers > 0 ? Math.round((v.revenueExGst / v.covers) * 100) / 100 : 0,
      covers: v.covers,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Day-of-week heatmap — avg revenue per DoW
  const dowBuckets = new Map<number, number[]>()
  for (const [dateStr, v] of byDate) {
    const d = new Date(dateStr)
    const dow = d.getUTCDay()
    const arr = dowBuckets.get(dow) ?? []
    arr.push(v.revenueExGst)
    dowBuckets.set(dow, arr)
  }
  const dowHeatmap = [0, 1, 2, 3, 4, 5, 6].map((dow) => {
    const arr = dowBuckets.get(dow) ?? []
    const avg = arr.length > 0 ? arr.reduce((s, n) => s + n, 0) / arr.length : 0
    return {
      dow,
      dowLabel: DOW_LABELS[dow],
      avgRevenue: Math.round(avg * 100) / 100,
    }
  })

  // Best seller movers — compare last 7 days to the prior 7
  const last7Start = startOfAestDay(7)
  const prev7Start = startOfAestDay(14)

  const [thisWeekByItem, prevWeekByItem] = await Promise.all([
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: { ...venueFilter, date: { gte: last7Start } },
      _sum: { quantitySold: true, revenue: true },
    }),
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: {
        ...venueFilter,
        date: { gte: prev7Start, lt: last7Start },
      },
      _sum: { quantitySold: true },
    }),
  ])

  const prevMap = new Map<string, number>()
  for (const r of prevWeekByItem) {
    prevMap.set(r.menuItemName, r._sum.quantitySold ?? 0)
  }

  const bestSellerMovers = thisWeekByItem
    .map((r) => {
      const prev = prevMap.get(r.menuItemName) ?? 0
      const now = r._sum.quantitySold ?? 0
      const deltaPct = prev > 0 ? ((now - prev) / prev) * 100 : now > 0 ? 100 : 0
      return {
        name: r.menuItemName,
        prevWeekQty: prev,
        thisWeekQty: now,
        deltaPct: Math.round(deltaPct),
        thisWeekRevenue: Math.round(Number(r._sum.revenue ?? 0) * 100) / 100,
      }
    })
    .filter((r) => r.thisWeekQty > 0)
    .sort((a, b) => b.deltaPct - a.deltaPct)
    .slice(0, 10)

  // Underperformers — dishes whose 28-day qty dropped > 30% vs prior 28
  const recent28Start = startOfAestDay(28)
  const prev28Start = startOfAestDay(56)

  const [recent28ByItem, prev28ByItem] = await Promise.all([
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: { ...venueFilter, date: { gte: recent28Start } },
      _sum: { quantitySold: true },
    }),
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: {
        ...venueFilter,
        date: { gte: prev28Start, lt: recent28Start },
      },
      _sum: { quantitySold: true },
    }),
  ])

  const prev28Map = new Map<string, number>()
  for (const r of prev28ByItem) {
    prev28Map.set(r.menuItemName, r._sum.quantitySold ?? 0)
  }

  const underperformers = recent28ByItem
    .map((r) => {
      const prev = prev28Map.get(r.menuItemName) ?? 0
      const now = r._sum.quantitySold ?? 0
      const dropPct = prev > 0 ? ((now - prev) / prev) * 100 : 0
      return {
        name: r.menuItemName,
        prev28dQty: prev,
        recent28dQty: now,
        dropPct: Math.round(dropPct),
      }
    })
    .filter((r) => r.prev28dQty >= 10 && r.dropPct <= -30)
    .sort((a, b) => a.dropPct - b.dropPct)
    .slice(0, 10)

  // Menu mix — revenue by MenuCategory (via Dish join)
  const matchedSales = await db.dailySales.findMany({
    where: {
      ...venueFilter,
      date: { gte: start },
      dishId: { not: null },
    },
    include: { dish: { select: { menuCategory: true } } },
  })
  const mixMap = new Map<string, number>()
  for (const s of matchedSales) {
    const cat = s.dish?.menuCategory ?? "OTHER"
    mixMap.set(cat, (mixMap.get(cat) ?? 0) + Number(s.revenueExGst))
  }
  const mixTotal = Array.from(mixMap.values()).reduce((s, n) => s + n, 0)
  const menuMix = Array.from(mixMap.entries())
    .map(([menuCategory, revenue]) => ({
      menuCategory,
      revenue: Math.round(revenue * 100) / 100,
      pctOfTotal: mixTotal > 0 ? Math.round((revenue / mixTotal) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  // Labour % — org-wide only (WeeklyLabourCost has no venue column)
  const labourRows = await db.weeklyLabourCost.findMany({
    where: { weekStart: { gte: start } },
    orderBy: { weekStart: "asc" },
  })
  let labourPct: AnalysisData["labourPct"] = null
  if (labourRows.length > 0) {
    // Aggregate revenue per week (all venues — labour isn't venue-tagged)
    const weeklyRevenue = new Map<string, number>()
    const allVenueSummaries =
      venue === "ALL"
        ? summaries
        : await db.dailySalesSummary.findMany({
            where: {
              venue: { in: [...SINGLE_VENUES] as Venue[] },
              date: { gte: start },
            },
          })
    for (const s of allVenueSummaries) {
      const d = new Date(s.date)
      const day = d.getUTCDay()
      const monday = new Date(d)
      monday.setUTCDate(d.getUTCDate() - ((day + 6) % 7))
      const key = monday.toISOString().split("T")[0]
      weeklyRevenue.set(
        key,
        (weeklyRevenue.get(key) ?? 0) + Number(s.totalRevenueExGst)
      )
    }

    labourPct = labourRows.map((l) => {
      const key = l.weekStart.toISOString().split("T")[0]
      const revenue = weeklyRevenue.get(key) ?? 0
      return {
        weekStart: key,
        labourCost: Number(l.totalCost),
        revenue: Math.round(revenue * 100) / 100,
        pctOfRevenue:
          revenue > 0
            ? Math.round((Number(l.totalCost) / revenue) * 10000) / 100
            : 0,
      }
    })
  }

  return {
    rangeDays,
    venue,
    revenueTrend,
    grossMargin,
    basketSize,
    dowHeatmap,
    bestSellerMovers,
    underperformers,
    menuMix,
    labourPct,
  }
}
