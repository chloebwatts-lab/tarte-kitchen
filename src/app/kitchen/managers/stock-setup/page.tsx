export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { requireManager } from "@/lib/manager-auth"
import { getStockSetup } from "@/lib/actions/venue-stock-setup"
import { StockSetup } from "@/components/kitchen/StockSetup"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is Venue => VENUES.includes(v as Venue)

export default async function StockSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireManager("/kitchen/managers/stock-setup")
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue = isVenue(p) ? p : isVenue(c) ? c : "BURLEIGH"
  const areas = await getStockSetup(venue)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Stock list" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            Stock list
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            What the stock walk asks about. Fine / Low / Out for the cheap fast stuff,
            Counted with a par for anything worth a number. Fifteen to twenty items is plenty.
          </p>
        </div>
        <VenueSwitch current={venue} />
      </div>
      <StockSetup venue={venue} areas={areas} />
    </div>
  )
}
