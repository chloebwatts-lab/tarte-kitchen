export const dynamic = "force-dynamic"

import { getWasteStats, getWasteInsights, getWasteEntries } from "@/lib/actions/wastage"
import { WastageDashboard } from "@/components/wastage-dashboard"

export default async function WastagePage() {
  const [stats, insights, entries] = await Promise.all([
    getWasteStats(),
    getWasteInsights(),
    getWasteEntries({ page: 1, pageSize: 20 }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Wastage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track and reduce food waste across both venues
          </p>
        </div>
      </div>
      <WastageDashboard
        stats={stats}
        insights={insights}
        initialEntries={entries}
      />
    </div>
  )
}
