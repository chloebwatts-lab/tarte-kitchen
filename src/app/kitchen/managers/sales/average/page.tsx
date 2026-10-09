export const dynamic = "force-dynamic"

import { requireManager } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { SalesNav } from "@/components/kitchen/SalesNav"
import { salesVenue } from "../_venue"
import { AvgSaleSimple } from "@/components/kitchen/AvgSaleSimple"
import { getAvgSaleBoard } from "@/lib/actions/avg-sale"

export default async function AverageSalePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireManager("/kitchen/managers/sales/average")
  const venue = await salesVenue(await searchParams)
  const initial = await getAvgSaleBoard(venue, "today", "CAFE")
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Average sale" }]} />
      <SalesNav current="average" venue={venue} />
      <VenueSwitch current={venue} />
      <AvgSaleSimple key={venue} initial={initial} />
    </div>
  )
}
