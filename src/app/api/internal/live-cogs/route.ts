import { NextRequest } from "next/server"
import { getCurrentWeekSpend } from "@/lib/spend/current-week"

export const dynamic = "force-dynamic"

/**
 * Where each venue's COGS is tracking this week, for Tarte Shifts' daily
 * owner note (Chloe + Shawna, 16 Oct 2026). Same numbers as /spend and the
 * Sunday email: estimated spend to date (invoices grossed up for deliveries
 * not yet invoiced) against POS revenue to date, plus the week's pace.
 * leftToSpend is the /spend headline since 23 Oct 2026: budget minus spend
 * so far minus the usual deliveries still to come (usualStillToCome);
 * leftBeforeStillToCome is the old figure, budget minus spend so far.
 * Bearer = CRON_SECRET like the other internal routes.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization")
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 })
  const snap = await getCurrentWeekSpend()
  return Response.json({
    weekStartWed: snap.weekStartWed,
    todayAest: snap.todayAest,
    buckets: snap.buckets.map((b) => ({
      bucket: b.bucket,
      label: b.label,
      spentToDate: Math.round(b.spentToDate),
      estimatedSpentToDate: Math.round(b.estimatedSpentToDate),
      revenueToDateExGst: b.revenueToDateExGst == null ? null : Math.round(b.revenueToDateExGst),
      revenueDaysReported: b.revenueDaysReported,
      lastRevenueDate: b.lastRevenueDate,
      cogsPctToDate: b.revenueToDateExGst && b.revenueToDateExGst > 0 ? Math.round((b.estimatedSpentToDate / b.revenueToDateExGst) * 1000) / 10 : null,
      targetPct: b.targetPct,
      budget: b.budget == null ? null : Math.round(b.budget),
      leftToSpend: b.leftToSpend == null ? null : Math.round(b.leftToSpend),
      usualStillToCome: Math.round(b.usualStillToCome),
      leftBeforeStillToCome: b.leftBeforeStillToCome == null ? null : Math.round(b.leftBeforeStillToCome),
      stillToCome: b.stillToCome.slice(0, 5).map((r) => ({ supplier: r.supplier, amount: Math.round(r.amount), days: r.days })),
      projectedEndOfWeek: Math.round(b.projectedEndOfWeek),
      projectedRevenueExGst: b.projectedRevenueExGst == null ? null : Math.round(b.projectedRevenueExGst),
      projectedPct: b.projectedRevenueExGst && b.projectedRevenueExGst > 0 ? Math.round((b.projectedEndOfWeek / b.projectedRevenueExGst) * 1000) / 10 : null,
      paceStatus: b.paceStatus,
    })),
  })
}
