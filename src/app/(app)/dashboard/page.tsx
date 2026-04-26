export const dynamic = "force-dynamic"

import { getDashboardStats, getDashboardHighlights } from "@/lib/actions/dashboard"
import { DashboardContent } from "@/components/dashboard-content"
import { getVenueSalesSnapshot } from "@/lib/actions/venue-metrics"
import { VenueSalesTile } from "@/components/venue-sales-tile"
import { SINGLE_VENUES } from "@/lib/venues"
import { getLatestDailyReport } from "@/lib/actions/daily-report"
import { DailyReportSection } from "@/components/daily-report"
import { getDailySummaryData } from "@/lib/actions/checklist-alerts"
import { getOverdueChecklists } from "@/lib/actions/checklist-alerts"
import { getLiveWeekLabourSnapshot } from "@/lib/actions/labour"
import { DashboardOpsPanel } from "@/components/dashboard-ops-panel"
import { DashboardHighlights } from "@/components/dashboard-highlights"

export default async function DashboardPage() {
  const [stats, dailyReport, checklistSummary, overdue, labour, highlights, ...snapshots] = await Promise.all([
    getDashboardStats(),
    getLatestDailyReport(),
    getDailySummaryData(),
    getOverdueChecklists(),
    getLiveWeekLabourSnapshot(),
    getDashboardHighlights(),
    ...SINGLE_VENUES.map((v) => getVenueSalesSnapshot(v)),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your kitchen operations and costs
        </p>
      </div>

      {/* Operations at a glance */}
      <DashboardOpsPanel
        checklists={{ totalTemplates: checklistSummary.totalTemplates, totalIncomplete: checklistSummary.totalIncomplete }}
        overdue={overdue}
        labour={labour}
      />

      {/* Sales · Waste · Supplier spike */}
      <DashboardHighlights data={highlights} />

      {/* Lightspeed end-of-day report (mirrors the emailed PDF sections) */}
      <DailyReportSection data={dailyReport} />

      {/* Per-venue revenue & best sellers */}
      <div>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Sales by venue
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {snapshots.map((snapshot) => (
            <VenueSalesTile key={snapshot.venue} snapshot={snapshot} />
          ))}
        </div>
      </div>

      <DashboardContent stats={stats} />
    </div>
  )
}
