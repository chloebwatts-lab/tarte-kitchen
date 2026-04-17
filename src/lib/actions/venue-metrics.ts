"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"

export interface TopSeller {
  name: string
  qty: number
  revenue: number
}

export interface VenueSalesSnapshot {
  venue: Venue
  today: { revenueExGst: number; covers: number; averageSpend: number } | null
  last7: { revenueExGst: number; covers: number; averageSpend: number }
  last28: { revenueExGst: number; covers: number; averageSpend: number }
  topSellersQty: TopSeller[]
  topSellersRevenue: TopSeller[]
  dailyRevenue: { date: string; revenueExGst: number }[] // last 14 days
  voids: number
  comps: number
}

function startOfAestDay(offsetDays = 0): Date {
  const now = new Date()
  const aestOffset = 10 * 60 * 60 * 1000
  const aestNow = new Date(now.getTime() + aestOffset)
  aestNow.setUTCHours(0, 0, 0, 0)
  aestNow.setUTCDate(aestNow.getUTCDate() - offsetDays)
  return new Date(aestNow.toISOString().split("T")[0])
}

export async function getVenueSalesSnapshot(
  venue: Venue
): Promise<VenueSalesSnapshot> {
  const today = startOfAestDay(0)
  const d7 = startOfAestDay(7)
  const d28 = startOfAestDay(28)
  const d14 = startOfAestDay(14)

  const [
    todaySummary,
    last7Summaries,
    last28Summaries,
    last14Summaries,
    topByQty,
    topByRevenue,
  ] = await Promise.all([
    db.dailySalesSummary.findUnique({
      where: { date_venue: { date: today, venue } },
    }),
    db.dailySalesSummary.findMany({
      where: { venue, date: { gte: d7 } },
    }),
    db.dailySalesSummary.findMany({
      where: { venue, date: { gte: d28 } },
    }),
    db.dailySalesSummary.findMany({
      where: { venue, date: { gte: d14 } },
      orderBy: { date: "asc" },
    }),
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: { venue, date: { gte: d7 } },
      _sum: { quantitySold: true, revenue: true },
      orderBy: { _sum: { quantitySold: "desc" } },
      take: 10,
    }),
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: { venue, date: { gte: d7 } },
      _sum: { quantitySold: true, revenue: true },
      orderBy: { _sum: { revenue: "desc" } },
      take: 10,
    }),
  ])

  const sumSummaries = (rows: typeof last7Summaries) => {
    const revenueExGst = rows.reduce(
      (s, r) => s + Number(r.totalRevenueExGst),
      0
    )
    const covers = rows.reduce((s, r) => s + r.totalCovers, 0)
    const averageSpend = covers > 0 ? revenueExGst / covers : 0
    return {
      revenueExGst: Math.round(revenueExGst * 100) / 100,
      covers,
      averageSpend: Math.round(averageSpend * 100) / 100,
    }
  }

  return {
    venue,
    today: todaySummary
      ? {
          revenueExGst:
            Math.round(Number(todaySummary.totalRevenueExGst) * 100) / 100,
          covers: todaySummary.totalCovers,
          averageSpend:
            Math.round(Number(todaySummary.averageSpend) * 100) / 100,
        }
      : null,
    last7: sumSummaries(last7Summaries),
    last28: sumSummaries(last28Summaries),
    topSellersQty: topByQty.map((r) => ({
      name: r.menuItemName,
      qty: r._sum.quantitySold ?? 0,
      revenue: Math.round(Number(r._sum.revenue ?? 0) * 100) / 100,
    })),
    topSellersRevenue: topByRevenue.map((r) => ({
      name: r.menuItemName,
      qty: r._sum.quantitySold ?? 0,
      revenue: Math.round(Number(r._sum.revenue ?? 0) * 100) / 100,
    })),
    dailyRevenue: last14Summaries.map((s) => ({
      date: s.date.toISOString().split("T")[0],
      revenueExGst: Math.round(Number(s.totalRevenueExGst) * 100) / 100,
    })),
    voids: last7Summaries.reduce((s, r) => s + r.totalVoids, 0),
    comps: last7Summaries.reduce((s, r) => s + r.totalComps, 0),
  }
}
