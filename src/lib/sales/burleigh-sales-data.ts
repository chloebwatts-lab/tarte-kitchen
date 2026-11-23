import { db } from "@/lib/db"
import { addDays, todayAest, ymd } from "@/lib/commitments/weeks"
import { buildVenueDaily, type VenueDaily } from "@/lib/sales/venue-daily"

/**
 * Burleigh net sales ex GST from Square (DailySalesSummary, synced every half
 * hour, paid orders only), today and the last 14 days. A plain server read
 * for the page, not a server action: nothing here can be called by id.
 */
export async function loadBurleighDaily(): Promise<VenueDaily> {
  const today = todayAest()
  const rows = await db.dailySalesSummary.findMany({
    where: { venue: "BURLEIGH", date: { gte: addDays(today, -21), lte: today } },
    select: { date: true, totalRevenueExGst: true, totalOrders: true },
  })
  return buildVenueDaily(
    rows.map((r) => ({ date: ymd(r.date), exGst: Number(r.totalRevenueExGst), orders: r.totalOrders })),
    ymd(today),
  )
}
