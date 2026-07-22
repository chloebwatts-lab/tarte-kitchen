export const dynamic = "force-dynamic"

import { getRestockRun } from "@/lib/actions/restock"
import { RestockRunBoard } from "@/components/kitchen/RestockRunBoard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"

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
  const venue: Venue = isVenue(venueParam) ? venueParam : "BEACH_HOUSE"

  const run = await getRestockRun(venue)
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

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
          the batch. Log what you actually deliver — gaps show on the daily
          report.
        </p>
      </div>

      <RestockRunBoard initialRun={run} />
    </div>
  )
}
