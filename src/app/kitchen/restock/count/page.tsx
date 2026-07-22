export const dynamic = "force-dynamic"

import { getCountSheet } from "@/lib/actions/restock"
import { RestockCountSheet } from "@/components/kitchen/RestockCountSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"
import { STATION_LABEL, isKitchenStation } from "@/lib/stations"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function RestockCountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const stationParam = typeof sp.station === "string" ? sp.station : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BEACH_HOUSE"
  const station = isKitchenStation(stationParam) ? stationParam : "MAIN"

  const sheet = await getCountSheet({ venue, station })
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Restock & prep", href: `/kitchen/restock?venue=${venue}` },
          { label: STATION_LABEL[station] },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          {STATION_LABEL[station]} — evening count
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Count what&apos;s left of each item and enter how much the kitchen
          needs for tomorrow. Leave &ldquo;Need&rdquo; empty for anything
          you&apos;re fine on. It saves as you go — send it to the prep chef
          when you&apos;re done.
        </p>
      </div>

      <RestockCountSheet initialSheet={sheet} />
    </div>
  )
}
