"use server"

import { db } from "@/lib/db"
import { Venue } from "@/generated/prisma"
import { SINGLE_VENUES } from "@/lib/venues"

export interface DailyReportCategory {
  categoryName: string
  topProducts: { name: string; quantity: number; rank: number }[]
}

export interface DailyReportSite {
  venue: Venue
  totalIncTax: number
  totalExTax: number
  categories: DailyReportCategory[]
}

export interface DailyReport {
  date: string | null // YYYY-MM-DD
  sites: DailyReportSite[]
}

/**
 * Pull the most recent Lightspeed EOD report (as delivered by the email
 * ingest) for display. Returns per-site revenue + per-category top items.
 */
export async function getLatestDailyReport(): Promise<DailyReport> {
  // Most recent date for which we have EMAIL-source summaries.
  const latestSummary = await db.dailySalesSummary.findFirst({
    where: {
      source: "EMAIL",
      venue: { in: [...SINGLE_VENUES] as Venue[] },
    },
    orderBy: { date: "desc" },
  })

  if (!latestSummary) return { date: null, sites: [] }

  const date = latestSummary.date

  const summaries = await db.dailySalesSummary.findMany({
    where: {
      date,
      source: "EMAIL",
      venue: { in: [...SINGLE_VENUES] as Venue[] },
    },
    orderBy: { venue: "asc" },
  })

  const topItems = await db.dailyCategoryTopItem.findMany({
    where: { date, venue: { in: [...SINGLE_VENUES] as Venue[] } },
    orderBy: [{ venue: "asc" }, { categoryName: "asc" }, { rank: "asc" }],
  })

  // Group top items by (venue, categoryName).
  type CatMap = Map<string, DailyReportCategory>
  const perVenue = new Map<Venue, CatMap>()
  for (const item of topItems) {
    const cat = perVenue.get(item.venue) ?? new Map<string, DailyReportCategory>()
    const entry =
      cat.get(item.categoryName) ??
      ({ categoryName: item.categoryName, topProducts: [] } as DailyReportCategory)
    entry.topProducts.push({
      name: item.productName,
      quantity: item.quantity,
      rank: item.rank,
    })
    cat.set(item.categoryName, entry)
    perVenue.set(item.venue, cat)
  }

  const sites: DailyReportSite[] = summaries.map((s) => {
    const cats = Array.from(perVenue.get(s.venue)?.values() ?? [])
    // Sort categories alphabetically — matches the report's layout.
    cats.sort((a, b) => a.categoryName.localeCompare(b.categoryName))
    return {
      venue: s.venue,
      totalIncTax: Math.round(Number(s.totalRevenue) * 100) / 100,
      totalExTax: Math.round(Number(s.totalRevenueExGst) * 100) / 100,
      categories: cats,
    }
  })

  return {
    date: date.toISOString().split("T")[0],
    sites,
  }
}
