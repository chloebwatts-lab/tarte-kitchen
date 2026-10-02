import { db } from "@/lib/db"
import Decimal from "decimal.js"
import type { Venue } from "@/generated/prisma/client"
import { normalizeVenueSlug } from "@/lib/venues"
import type { SquareDailySummary } from "./email-parser"

/**
 * Square location name -> venue. Square's locations are "Tarte Beach House",
 * "Tea Gardens" and (from ~13 Oct 2026) the Burleigh location; the shared
 * venue normaliser already understands all three spellings.
 */
export function resolveSquareVenue(locationName: string): Venue | null {
  const v = normalizeVenueSlug(locationName)
  if (!v || v === "BOTH") return null
  return v
}

export interface SquareImportResult {
  venue: Venue
  date: string
  grossSales: number
  categories: number
}

/**
 * Write one Square daily summary into the reporting tables. Idempotent:
 * re-importing the same day replaces the summary and the category rows.
 *
 * Mapping (mirrors what the Lightspeed EOD import stored, so weekly digest,
 * dashboard tiles and labour % keep reading the same columns):
 *   totalRevenue      = Gross sales (net sales + GST, after returns/discounts)
 *   totalRevenueExGst = Net sales
 *   totalCovers       = Total covers
 *   averageSpend      = Average order (ex GST, per closed order)
 *   fees              = Fees incl GST (Square processing fees for the day)
 *   totalOrders       = Total orders
 *   source            = EMAIL (so the Lightspeed API poller treats it as final)
 * Voids/comps counts are not in Square's email; left at 0.
 */
export async function importSquareDailySummary(
  summary: SquareDailySummary,
  opts: { gmailMessageId?: string } = {}
): Promise<SquareImportResult> {
  const venue = resolveSquareVenue(summary.locationName)
  if (!venue) {
    throw new Error(`Square daily summary: unresolved venue for location "${summary.locationName}"`)
  }
  const date = new Date(summary.date)

  await db.dailySalesSummary.upsert({
    where: { date_venue: { date, venue } },
    update: {
      totalRevenue: summary.grossSales,
      totalRevenueExGst: summary.netSalesExGst,
      totalCovers: summary.totalCovers,
      averageSpend: summary.averageOrder,
      fees: summary.fees,
      totalOrders: summary.totalOrders,
      source: "EMAIL",
    },
    create: {
      date,
      venue,
      totalRevenue: summary.grossSales,
      totalRevenueExGst: summary.netSalesExGst,
      totalCovers: summary.totalCovers,
      averageSpend: summary.averageOrder,
      totalVoids: 0,
      totalComps: 0,
      fees: summary.fees,
      totalOrders: summary.totalOrders,
      source: "EMAIL",
    },
  })

  await db.dailyCategorySales.deleteMany({ where: { date, venue } })
  if (summary.categories.length) {
    await db.dailyCategorySales.createMany({
      data: summary.categories.map((c) => ({
        date,
        venue,
        categoryName: c.name,
        itemsSold: c.itemsSold,
        netSalesExGst: c.netSalesExGst,
      })),
      skipDuplicates: true,
    })
  }

  if (opts.gmailMessageId) {
    await db.squareReportImport.upsert({
      where: { gmailMessageId: opts.gmailMessageId },
      update: { reportDate: date, venue },
      create: { gmailMessageId: opts.gmailMessageId, reportDate: date, venue },
    })
  }

  return {
    venue,
    date: summary.date,
    grossSales: new Decimal(summary.grossSales).toNumber(),
    categories: summary.categories.length,
  }
}
