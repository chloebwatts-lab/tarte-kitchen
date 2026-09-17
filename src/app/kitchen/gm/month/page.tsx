export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { getGmMonth, getGmTracking } from "@/lib/actions/gm"
import { GmMonthSheet } from "@/components/kitchen/GmMonthSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function GmMonthPage() {
  await requireGm("/kitchen/gm/month")
  const [month, tracking] = await Promise.all([getGmMonth(), getGmTracking()])
  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Tracking" }]} />
      <GmMonthSheet month={month} tracking={tracking} />
    </div>
  )
}
