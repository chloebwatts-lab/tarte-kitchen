export const dynamic = "force-dynamic"

import { getWastageAnalytics } from "@/lib/actions/wastage-analytics"
import { WastageAnalyticsView } from "@/components/wastage-analytics-view"

export default async function WastageAnalyticsPage() {
  const initial = await getWastageAnalytics({ venue: "ALL", rangeDays: 28 })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Wastage Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Where the money is leaking. Combines waste entries, sales, and
          stocktake variance to show reported vs. unaccounted loss.
        </p>
      </div>
      <WastageAnalyticsView initial={initial} />
    </div>
  )
}
