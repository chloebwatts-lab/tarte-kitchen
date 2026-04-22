export const dynamic = "force-dynamic"

import { getFoodSafetyLog } from "@/lib/actions/checklists"
import { FoodSafetyLog } from "@/components/food-safety-log"
import { BackLink } from "@/components/ui/back-link"

export default async function FoodSafetyLogPage() {
  const runs = await getFoodSafetyLog()
  return (
    <div className="space-y-6">
      <BackLink href="/checklists" label="Back to checklists" />
      <FoodSafetyLog runs={runs} />
    </div>
  )
}
