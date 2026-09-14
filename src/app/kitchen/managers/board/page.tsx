export const dynamic = "force-dynamic"

import Link from "next/link"
import { cookies } from "next/headers"
import { requireManager } from "@/lib/manager-auth"
import { getMorningBoard } from "@/lib/actions/venue-ops"
import { getBelowPar } from "@/lib/actions/venue-stock"
import { VenueOpsBoard } from "@/components/venue-ops-board"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"

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

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Morning board" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            Morning board
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            Put a name on anything without one. Chase anything waiting on someone else.
          </p>
        </div>
        <div className="flex gap-1.5">
          {VENUES.map((x) => (
            <Link key={x} href={`/kitchen/managers/board?venue=${x}`}
              className={`rounded-[10px] px-3 py-1.5 text-[14px] font-semibold ${x === venue ? "bg-[var(--tk-charcoal)] text-white" : "border border-[var(--tk-line)] text-[var(--tk-ink-soft)]"}`}>
              {VENUE_LABEL[x].replace(/\s*\(.*\)$/, "")}
            </Link>
          ))}
        </div>
      </div>
      <VenueOpsBoard board={board} belowPar={belowPar} />
    </div>
  )
}
