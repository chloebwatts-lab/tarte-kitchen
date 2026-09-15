export const dynamic = "force-dynamic"

import Link from "next/link"
import { cookies } from "next/headers"
import { requireManager } from "@/lib/manager-auth"
import { getOwnList, getVenueTeam } from "@/lib/actions/venue-ops"
import { OwnList } from "@/components/kitchen/OwnList"
import { ManagerTabs } from "@/components/kitchen/ManagerTabs"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is Venue => VENUES.includes(v as Venue)

export default async function ManagerListPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireManager("/kitchen/managers/list")
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue = isVenue(p) ? p : isVenue(c) ? c : "BURLEIGH"
  const team = await getVenueTeam(venue)
  const manager = team.find((m) => m.role === "MANAGER")?.name ?? null
  const who = (typeof sp.who === "string" && sp.who.trim()) || manager
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  const list = who ? await getOwnList(venue, who) : null
  const first = who ? who.split(/\s+/)[0] : null

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: first ? `${first}'s list` : "My list" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            {first ? `${first}'s list` : "My list"}
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            Yours alone at {venueLabel}. Add a line, tick it off. Nobody else picks these up;
            the other managers only see the size of the list, on the plate view.
          </p>
        </div>
        <VenueSwitch current={venue} />
      </div>
      <ManagerTabs venue={venue} manager={manager} active="list" />
      {list ? (
        <OwnList list={list} venue={venue} />
      ) : (
        <div className="rounded-[16px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-4 py-5 md:px-5">
          <p className="text-[17px] text-[var(--tk-charcoal)]">
            No manager is listed for {venueLabel} yet, so pick whose list this is.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {team.map((m) => (
              <Link
                key={m.name}
                href={`/kitchen/managers/list?venue=${venue}&who=${encodeURIComponent(m.name)}`}
                className="rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-3 py-2 text-[15px] font-semibold text-[var(--tk-charcoal)]"
              >
                {m.name}
              </Link>
            ))}
          </div>
          {team.length === 0 ? (
            <p className="mt-3 text-[15px] text-[var(--tk-ink-soft)]">
              Add <code>?who=Name</code> to the address for now. Chloe can add the team for this venue.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}
