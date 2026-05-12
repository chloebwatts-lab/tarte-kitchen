export const dynamic = "force-dynamic"

import { getPrepSheet } from "@/lib/actions/prep-sheet"
import { PrepWalkthrough } from "@/components/kitchen/PrepWalkthrough"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function KitchenPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BURLEIGH"
  const dateParam = typeof sp.date === "string" ? sp.date : undefined

  const sheet = await getPrepSheet({ venue, forDate: dateParam })
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Prep walk-through" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Prep walk-through
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          One prep at a time. Built from the last 4 same-weekday sales at{" "}
          {venueLabel}. Tap <strong>Done</strong> as you make each batch, or{" "}
          <strong>Skip</strong> if you already have enough.
        </p>
      </div>

      <PrepWalkthrough sheet={sheet} venue={venue} />
    </div>
  )
}
