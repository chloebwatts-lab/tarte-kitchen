export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getJobsBoard } from "@/lib/actions/venue-ops"
import { JobsBoard } from "@/components/kitchen/JobsBoard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const isVenue = (v: string | null): v is Venue =>
  v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"

/** Staff-side, behind the staff login only. Nothing here needs the managers password. */
export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(p) ? p : isVenue(c) ? c : null
  if (!venue) return <KitchenVenuePicker />
  const board = await getJobsBoard(venue)
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Jobs board" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            Jobs board
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            What the morning board has put on you. Tap Done when it is. If you can&apos;t do it,
            hand it back so it goes to someone else instead of sitting on you.
          </p>
        </div>
        <VenueSwitch current={venue} />
      </div>
      <JobsBoard board={board} venueLabel={venueLabel} />
    </div>
  )
}
