export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getCountSheet } from "@/lib/actions/restock"
import { RestockCountSheet } from "@/components/kitchen/RestockCountSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
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
  // Explicit ?venue= wins; otherwise use the venue remembered by the
  // picker's tk-venue cookie. Never silently default to a venue.
  const cookieVenue = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(venueParam)
    ? venueParam
    : isVenue(cookieVenue)
      ? cookieVenue
      : null
  if (!venue) return <KitchenVenuePicker />
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
          {STATION_LABEL[station]} evening count
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Count your <strong>backup prep in the coolroom</strong>, not
          what&apos;s in the section, that&apos;s always topped up. Count in
          each item&apos;s usual container. Leave &ldquo;Need&rdquo; empty for
          anything you&apos;re fine on. It saves as you go. Send it to the
          prep chef when you&apos;re done.
        </p>
        <p className="mt-2 text-[14px] text-[var(--tk-ink-soft)]">
          Got the Apple Pencil?{" "}
          <a
            href={`/kitchen/restock/paper?venue=${venue}&station=${station}`}
            className="font-medium text-[var(--tk-charcoal)] underline underline-offset-2"
          >
            Try the paper-style sheet
          </a>{" "}
          and write in the boxes like the old printed one. Both fill in the
          same count.
        </p>
      </div>

      <RestockCountSheet initialSheet={sheet} />
    </div>
  )
}
