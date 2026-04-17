export const dynamic = "force-dynamic"

import { getDashboardStats } from "@/lib/actions/dashboard"
import { DashboardContent } from "@/components/dashboard-content"
import { getVenueSalesSnapshot } from "@/lib/actions/venue-metrics"
import { VenueSalesTile } from "@/components/venue-sales-tile"
import { SINGLE_VENUES } from "@/lib/venues"

export default async function DashboardPage() {
  const [stats, ...snapshots] = await Promise.all([
    getDashboardStats(),
    ...SINGLE_VENUES.map((v) => getVenueSalesSnapshot(v)),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your kitchen costs and menu performance
        </p>
      </div>

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
