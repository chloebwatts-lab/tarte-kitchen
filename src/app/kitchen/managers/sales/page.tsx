export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { requireManager } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { SalesInsights } from "@/components/kitchen/SalesInsights"
import { getSalesInsights } from "@/lib/actions/sales-insights"
import { brisbaneNow } from "@/lib/sales/insights"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is Venue => VENUES.includes(v as Venue)

export default async function SalesInsightsPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireManager("/kitchen/managers/sales")
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue = isVenue(p) ? p : isVenue(c) ? c : "BEACH_HOUSE"
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : brisbaneNow().date
  const initial = await getSalesInsights(venue, date, "1D", "WEEKS_4")
  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Sales insights" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            Sales insights
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            Live from Square, against the same day on earlier weeks. Lightspeed days from 5 Aug to 30 Sep
            fill the history until Square builds its own. Revenue is inc GST and excludes tips.
          </p>
        </div>
        <VenueSwitch current={venue} />
      </div>
      <SalesInsights initial={initial} />
    </div>
  )
}
