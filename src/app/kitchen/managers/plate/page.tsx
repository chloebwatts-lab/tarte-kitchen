export const dynamic = "force-dynamic"

import Link from "next/link"
import { cookies } from "next/headers"
import { requireManager } from "@/lib/manager-auth"
import { getManagerPlate, getVenueTeam } from "@/lib/actions/venue-ops"
import { ManagerPlate } from "@/components/kitchen/ManagerPlate"
import { ManagerTabs } from "@/components/kitchen/ManagerTabs"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is Venue => VENUES.includes(v as Venue)

export default async function ManagerPlatePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  await requireManager("/kitchen/managers/plate")
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue = isVenue(p) ? p : isVenue(c) ? c : "BURLEIGH"
  const team = await getVenueTeam(venue)
  const manager = team.find((m) => m.role === "MANAGER")?.name ?? null
  const who = (typeof sp.who === "string" && sp.who.trim()) || manager || team[0]?.name || null
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const plate = who ? await getManagerPlate(venue, who) : null
  const first = who ? who.split(/\s+/)[0] : null
  const people = plate?.people ?? team.map((m) => m.name)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: first ? `On ${first}` : "The plate" }]} />
      <div className="flex flex-wrap items-end justify-between gap-3 px-1">
        <div>
          <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
            {first ? `On ${first}` : "The plate"}
          </div>
          <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
            Everything on one person at {venueLabel}, in one place, for the other managers.
            The scope of the list, and roughly how long it is. Nothing here is up for grabs.
          </p>
        </div>
        <VenueSwitch current={venue} />
      </div>
      <ManagerTabs venue={venue} manager={manager} active="plate" />
      {people.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] text-[var(--tk-ink-soft)]">Show for</span>
          {people.map((n) => (
            <Link
              key={n}
              href={`/kitchen/managers/plate?venue=${venue}&who=${encodeURIComponent(n)}`}
              replace
              className={`rounded-[10px] px-3 py-1.5 text-[14px] font-semibold transition active:scale-[0.98] ${
                who && n.toLowerCase() === who.toLowerCase()
                  ? "bg-[var(--tk-charcoal)] text-white"
                  : "border border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-ink-soft)]"
              }`}
            >
              {n}
            </Link>
          ))}
        </div>
      ) : null}
      {plate ? (
        <ManagerPlate plate={plate} venueLabel={venueLabel} />
      ) : (
        <p className="px-1 text-[17px] text-[var(--tk-ink-soft)]">
          Nobody has owned a job at {venueLabel} yet. Put a name on something from the morning board first.
        </p>
      )}
    </div>
  )
}
