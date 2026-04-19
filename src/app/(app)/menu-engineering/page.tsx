export const dynamic = "force-dynamic"

import { getMenuEngineeringData } from "@/lib/actions/menu-engineering"
import { MenuEngineeringDashboard } from "@/components/menu-engineering-dashboard"

export default async function MenuEngineeringPage() {
  const initial = await getMenuEngineeringData({ venue: "ALL", rangeDays: 28 })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Menu Engineering
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Classify every dish by popularity and margin. Each quadrant has a
          different strategic play — protect stars, reprice plowhorses, promote
          puzzles, cut dogs.
        </p>
      </div>
      <MenuEngineeringDashboard initial={initial} />
    </div>
  )
}
