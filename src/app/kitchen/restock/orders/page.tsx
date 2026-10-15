export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { listOrderRequests } from "@/lib/actions/order-requests"
import { OrderRequests } from "@/components/kitchen/OrderRequests"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

/**
 * Order Requests (Jose, 15 Oct 2026): on the prep page, not on the prep
 * list. Chefs write down what needs ordering or did not arrive as they
 * notice it; the head chef works from it when placing orders and gets the
 * open list by email at 5pm.
 */
export default async function OrderRequestsPage({
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
  if (!venue) return <KitchenVenuePicker next="/kitchen/restock/orders" title="Order requests" blurb="Pick your venue once. This device opens your prep list from then on." />

  const rows = await listOrderRequests(venue)
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Prep list", href: `/kitchen/restock?venue=${venue}` },
          { label: "Order requests" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Order requests
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Notice something running out, or missing from a delivery? Write it
          here as you go, with your name, so the head chef sees everything in
          one place when placing orders. Tick it once it is ordered.
        </p>
        <div className="mt-3"><VenueSwitch current={venue} /></div>
      </div>

      <OrderRequests venue={venue} initial={rows} />
    </div>
  )
}
