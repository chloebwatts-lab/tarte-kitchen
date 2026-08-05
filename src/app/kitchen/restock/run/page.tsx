export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getRestockRun } from "@/lib/actions/restock"
import { RestockRunBoard } from "@/components/kitchen/RestockRunBoard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"
import { isKitchenStation, stationsForVenue } from "@/lib/stations"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function RestockRunPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  // Explicit ?venue= wins; otherwise use the venue remembered by the
  // picker's tk-venue cookie. Never silently default to a venue.
  const cookieVenue = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(venueParam)
    ? venueParam
    : isVenue(cookieVenue)
      ? cookieVenue
      : null
  if (!venue) return <KitchenVenuePicker />

  const run = await getRestockRun(venue)
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  // Optional ?station=CAFE deep link so each kitchen can bookmark its view
  const stationParam = typeof sp.station === "string" ? sp.station : null
  const initialStation =
    isKitchenStation(stationParam) &&
    stationsForVenue(venue).includes(stationParam)
      ? stationParam
      : ("ALL" as const)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Restock & prep", href: `/kitchen/restock?venue=${venue}` },
          { label: "Restock run" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Morning restock run
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          One consolidated list from every kitchen&apos;s evening count. Items
          needed in both kitchens are grouped so you make them once and split
          the batch. Log what you actually deliver. Gaps show on the daily
          report.
        </p>
      </div>

      <RestockRunBoard initialRun={run} initialStation={initialStation} />
    </div>
  )
}
