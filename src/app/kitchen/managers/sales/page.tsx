export const dynamic = "force-dynamic"

import { requireFullManager } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { SalesNav } from "@/components/kitchen/SalesNav"
import { SalesInsights } from "@/components/kitchen/SalesInsights"
import { getSalesInsights } from "@/lib/actions/sales-insights"
import { brisbaneNow } from "@/lib/sales/insights"
import { salesVenue } from "./_venue"

export default async function SalesInsightsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireFullManager("/kitchen/managers/sales")
  const sp = await searchParams
  const venue = await salesVenue(sp)
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : brisbaneNow().date
  const initial = await getSalesInsights(venue, date, "1D", "WEEKS_4")
  return (
    <div className="space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Sales" }]} />
      <SalesNav current="sales" venue={venue} />
      <VenueSwitch current={venue} />
      <SalesInsights key={venue} initial={initial} view="sales" />
    </div>
  )
}
