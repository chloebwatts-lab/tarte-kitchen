export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getCountSheet } from "@/lib/actions/restock"
import { RestockCountSheet } from "@/components/kitchen/RestockCountSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"
import { isKitchenStation, sectionFromParam, stationLabel } from "@/lib/stations"

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
  if (!venue) return <KitchenVenuePicker next="/kitchen/restock" title="Prep list" blurb="Pick your venue once. This device opens your prep list from then on." />
  const station = isKitchenStation(stationParam) ? stationParam : "MAIN"
  const section = sectionFromParam(venue, typeof sp.section === "string" ? sp.section : null)

  const sheet = await getCountSheet({ venue, station })
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Prep list", href: `/kitchen/restock?venue=${venue}` },
          { label: stationLabel(venue, station) },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          {venue === "BEACH_HOUSE"
            ? "Prep list, both kitchens"
            : venue === "BURLEIGH"
              ? "Prep list, all stations"
              : `${stationLabel(venue, station)} prep list`}
        </div>
        <p className="mt-1.5 max-w-3xl text-[14px] leading-snug text-[var(--tk-ink-soft)]">
          Tap <strong>+</strong> for anything you want made. Star in the
          order to make them. Tap a name for when, and a note. Saves as you go.{" "}
          <a
            href={`/kitchen/restock/paper?venue=${venue}&station=${station}`}
            className="font-medium text-[var(--tk-charcoal)] underline underline-offset-2"
          >
            Apple Pencil? Use the paper-style sheet.
          </a>
        </p>
      </div>

      <RestockCountSheet initialSheet={sheet} initialSection={section} />
    </div>
  )
}
