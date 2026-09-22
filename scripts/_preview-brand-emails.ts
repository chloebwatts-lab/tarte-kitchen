// Renders the end-of-day and weekly spend emails with sample data, to look at the layout.
// Run: npx tsx scripts/_preview-brand-emails.ts eod|spend
import { renderDailyAccountability } from "../src/lib/accountability/daily"
import { render as renderSpend } from "../src/lib/spend/weekly-email"

const which = process.argv[2] ?? "eod"
if (which === "eod") {
  const line = (text: string, who: string | null, age: string, flag: string | null = null) => ({ text, who, age, flag })
  const out = renderDailyAccountability({
    date: "Monday, 22 September",
    totals: { agenda: 3, fixes: 4, jobs: 2, orders: 3, unowned: 2 },
    groupAgenda: [line("Sunday surcharge from 1 October, tell the teams", "Chloe", "2 days")],
    venues: [
      {
        venue: "BURLEIGH",
        fixes: [line("Meiko dishwasher not draining", "Shawna", "3 days", "trade booked"), line("Grill igniter", null, "1 day", "no owner"), line("Cool room door seal split", "Oliver", "9 days", "over a week")],
        jobs: [line("Clean pastry racks with KP", "Vini", "today")],
        orders: [line("Gloves, size M", null, "2 days", "no owner"), line("Takeaway cups 8oz", "Georgia", "today")],
        agenda: [line("Trial shifts, who to keep", "Oliver", "1 day")],
      },
      {
        venue: "BEACH_HOUSE",
        fixes: [line("Coffee machine group 2 leaking", "Jessica", "today", "SAFETY")],
        jobs: [line("Restack dry store", "KP", "4 days")],
        orders: [line("Oat milk", "Jessica", "today")],
        agenda: [line("Weekend roster gaps", "Jessica", "today")],
      },
      { venue: "TEA_GARDEN", fixes: [], jobs: [], orders: [], agenda: [] },
    ],
  } as never)
  process.stdout.write(out.html)
} else {
  const bucket = (bucket: "BURLEIGH" | "CURRUMBIN", label: string, spent: number, budget: number, pace: "on-track" | "watch" | "over") => ({
    bucket, label, spentToDate: spent, forecastRevenue: budget / 0.28, estimatedMissingSpend: 0, effectiveSpent: spent, missingSpendBreakdown: [],
    targetPct: 28, budget, remaining: budget - spent, projectedEndOfWeek: spent * 1.6, spendProjectionMethod: "weighted", revenueProjectionMethod: "weighted",
    paceStatus: pace, invoiceCount: 14, daily: [], suppliers: [], revenueToDateExGst: (budget / 0.28) * 0.55, revenueDaysReported: 4, lastRevenueDate: "2026-09-20",
    projectedRevenueExGst: budget / 0.28, revenueDaily: [],
  })
  const out = renderSpend({
    weekStartWed: "2026-09-16", weekEndTue: "2026-09-22", todayAest: "2026-09-20", dayOfWeek: 5, daysElapsedFull: 4,
    buckets: [bucket("BURLEIGH", "Burleigh", 6120, 9800, "on-track"), bucket("CURRUMBIN", "Currumbin", 8450, 9100, "over")],
    coverage: [], unassigned: [{ id: "x", supplierName: "Bidfood", total: 412.5, invoiceDate: "2026-09-19" }] as never,
  } as never)
  process.stdout.write(out.html)
}
