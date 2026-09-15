export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { requireManager } from "@/lib/manager-auth"
import { getMorningBoard } from "@/lib/actions/venue-ops"
import { ManagerTabs } from "@/components/kitchen/ManagerTabs"
import { getBelowPar } from "@/lib/actions/venue-stock"
import { MorningBoard } from "@/components/kitchen/MorningBoard"
import { VENUE_LABEL } from "@/lib/venues"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is Venue => VENUES.includes(v as Venue)

export default async function ManagerBoardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireManager("/kitchen/managers/board")
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue = isVenue(p) ? p : isVenue(c) ? c : "BURLEIGH"
  const [board, belowPar] = await Promise.all([getMorningBoard(venue, ""), getBelowPar(venue)])
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Morning board" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            Morning board
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            Everything staff have spotted, every job that has come due, and anything the stock
            walk says is low. Put a name on what has none; it lands on their Jobs board. Chase what
            is waiting on someone else.
          </p>
        </div>
        <VenueSwitch current={venue} />
      </div>
      <ManagerTabs venue={venue} manager={board.team.find((m) => m.role === "MANAGER")?.name ?? null} active="board" />
      <MorningBoard board={board} belowPar={belowPar} venueLabel={venueLabel} />
    </div>
  )
}
