"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"

export async function getDailySalesSummaries(
  dateFrom: string,
  dateTo: string,
  venue?: Venue
) {
  const where: Record<string, unknown> = {
    date: {
      gte: new Date(dateFrom),
      lte: new Date(dateTo),
    },
  }
  if (venue) where.venue = venue

  const summaries = await db.dailySalesSummary.findMany({
    where,
    orderBy: { date: "desc" },
  })

  return summaries.map((s) => ({
    ...s,
    totalRevenue: Number(s.totalRevenue),
    totalRevenueExGst: Number(s.totalRevenueExGst),
    averageSpend: Number(s.averageSpend),
    theoreticalCogs: s.theoreticalCogs ? Number(s.theoreticalCogs) : null,
    date: s.date.toISOString().split("T")[0],
  }))
}

export async function getRevenueForPeriod(
  dateFrom: Date,
  dateTo: Date,
  venue?: Venue
): Promise<number> {
  const where: Record<string, unknown> = {
    date: { gte: dateFrom, lte: dateTo },
  }
  if (venue) where.venue = venue

  const summaries = await db.dailySalesSummary.findMany({ where })
  return summaries.reduce((sum, s) => sum + Number(s.totalRevenueExGst), 0)
}
