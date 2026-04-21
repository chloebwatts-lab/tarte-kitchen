export const dynamic = "force-dynamic"

import { getFoodSafetyLog } from "@/lib/actions/checklists"
import { FoodSafetyLog } from "@/components/food-safety-log"

export default async function FoodSafetyLogPage() {
  const runs = await getFoodSafetyLog()
  return <FoodSafetyLog runs={runs} />
}
