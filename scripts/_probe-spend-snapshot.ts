// READ-ONLY: run the real getCurrentWeekSpend() and print the new fields.
import { getCurrentWeekSpend } from "../src/lib/spend/current-week"

async function main() {
  const snap = await getCurrentWeekSpend()
  console.log(`week ${snap.weekStartWed} -> ${snap.weekEndTue}, day ${snap.dayOfWeek}/7`)
  for (const b of snap.buckets) {
    const projCogs =
      b.forecastRevenue && b.forecastRevenue > 0
        ? ((b.projectedEndOfWeek / b.forecastRevenue) * 100).toFixed(1)
        : "n/a"
    const liveCogs =
      b.projectedRevenueExGst && b.projectedRevenueExGst > 0
        ? ((b.projectedEndOfWeek / b.projectedRevenueExGst) * 100).toFixed(1)
        : "n/a"
    console.log(`\n=== ${b.label} ===`)
    console.log(` spentToDate=${b.spentToDate} budget=${b.budget} projectedEOW=${b.projectedEndOfWeek} (${b.budget ? Math.round((b.projectedEndOfWeek / b.budget) * 100) : "-"}% of budget)`)
    console.log(` projCOGS vs forecast=${projCogs}% target=${b.targetPct}%`)
    console.log(` revenueToDate=${b.revenueToDateExGst} daysReported=${b.revenueDaysReported} last=${b.lastRevenueDate}`)
    console.log(` projectedRevenue=${b.projectedRevenueExGst} -> liveCOGS=${liveCogs}%`)
    console.log(` revenueDaily:`, b.revenueDaily.map((d) => `${d.dayName} ${d.reported ? d.amount : "—"}`).join(" | "))
    console.log(` estMissing=${b.estimatedMissingSpend}`, b.missingSpendBreakdown)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
