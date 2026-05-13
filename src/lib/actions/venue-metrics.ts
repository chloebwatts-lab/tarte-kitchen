"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import { currentTarteWeekRange, tarteWeekLabel, startOfTarteWeekUtc } from "@/lib/dates"

export interface TopSeller {
  name: string
  qty: number
  revenue: number
}

export interface VenueSalesSnapshot {
  venue: Venue
  today: { revenueExGst: number; covers: number; averageSpend: number } | null
  /** Current Tarte trading week (Wed→Tue) to date — matches the weekly digest framing. */
  thisWeek: {
    revenueExGst: number
    covers: number
    averageSpend: number
    label: string // e.g. "Wed 29 Apr – Tue 5 May"
  }
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
  const d28 = startOfAestDay(28)
  const d14 = startOfAestDay(14)
  const { start: weekStart, end: weekEnd } = currentTarteWeekRange()

  const [
    todaySummary,
    thisWeekSummaries,
    last28Summaries,
    last14Summaries,
    topByQty,
    topByRevenue,
  ] = await Promise.all([
    db.dailySalesSummary.findUnique({
      where: { date_venue: { date: today, venue } },
    }),
    db.dailySalesSummary.findMany({
      where: { venue, date: { gte: weekStart, lt: weekEnd } },
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
      where: { venue, date: { gte: weekStart, lt: weekEnd } },
      _sum: { quantitySold: true, revenue: true },
      orderBy: { _sum: { quantitySold: "desc" } },
      take: 10,
    }),
    db.dailySales.groupBy({
      by: ["menuItemName"],
      where: { venue, date: { gte: weekStart, lt: weekEnd } },
      _sum: { quantitySold: true, revenue: true },
      orderBy: { _sum: { revenue: "desc" } },
      take: 10,
    }),
  ])

  const sumSummaries = (rows: typeof thisWeekSummaries) => {
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

  const weekTotals = sumSummaries(thisWeekSummaries)

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
    thisWeek: {
      ...weekTotals,
      label: tarteWeekLabel(startOfTarteWeekUtc(new Date())),
    },
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
    voids: thisWeekSummaries.reduce((s, r) => s + r.totalVoids, 0),
    comps: thisWeekSummaries.reduce((s, r) => s + r.totalComps, 0),
  }
}
