export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { getGmMonth } from "@/lib/actions/gm"
import { GmMonthSheet } from "@/components/kitchen/GmMonthSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function GmMonthPage() {
  await requireGm("/kitchen/gm/month")
  const month = await getGmMonth()
  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Month" }]} />
      <GmMonthSheet month={month} />
    </div>
  )
}
