export const dynamic = "force-dynamic"

import { getParSuggestions } from "@/lib/actions/par-levels"
import { ParLevelsView } from "@/components/par-levels-view"

export default async function ParLevelsPage() {
  const rows = await getParSuggestions()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Par Levels</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suggested par per venue, computed from the last 4 weeks of
          theoretical usage × supplier delivery-cadence multiplier, rounded
          up to whole packs. Edit anything, then save — anything you save
          flips the source to MANUAL and won&apos;t be overwritten by future
          suggestion re-runs.
        </p>
      </div>
      <ParLevelsView rows={rows} />
    </div>
  )
}
