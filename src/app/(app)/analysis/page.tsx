export const dynamic = "force-dynamic"

import { getAnalysisData } from "@/lib/actions/analysis"
import { AnalysisDashboard } from "@/components/analysis-dashboard"

export default async function AnalysisPage() {
  const initial = await getAnalysisData({ venue: "ALL", rangeDays: 28 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Analysis</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revenue trends, menu mix, movers, and growth signals across all three
          concepts.
        </p>
      </div>
      <AnalysisDashboard initial={initial} />
    </div>
  )
}
