export const dynamic = "force-dynamic"

import { requireManager } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { SalesNav } from "@/components/kitchen/SalesNav"
import { salesVenue } from "../_venue"
import { SalesInsights } from "@/components/kitchen/SalesInsights"
import { getSalesInsights } from "@/lib/actions/sales-insights"
import { brisbaneNow } from "@/lib/sales/insights"

export default async function SalesByHourPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireManager("/kitchen/managers/sales/hourly")
  const sp = await searchParams
  const venue = await salesVenue(sp)
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : brisbaneNow().date
  const initial = await getSalesInsights(venue, date, "1D", "WEEKS_4")
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Sales by hour" }]} />
      <SalesNav current="hourly" venue={venue} />
      <VenueSwitch current={venue} />
      <SalesInsights key={venue} initial={initial} view="hourly" />
    </div>
  )
}
