export const dynamic = "force-dynamic"

import {
  getPastryRotationDay,
  type PastryRotationDay,
} from "@/lib/actions/pastry-rotation"
import { PastryRotationDashboard } from "@/components/kitchen/PastryRotationDashboard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

function aestTodayString() {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  return aest.toISOString().split("T")[0]
}

export default async function PastryRotationPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BURLEIGH"
  const date =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : aestTodayString()

  const day: PastryRotationDay = await getPastryRotationDay({ venue, date })
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Pastry rotation" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Pastry rotation
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Log prepared, sold and discarded for each bake. Tap any cell to
          update. Data feeds the inspection view and the wastage dashboard.
        </p>
      </div>

      <PastryRotationDashboard initial={day} />
    </div>
  )
}
