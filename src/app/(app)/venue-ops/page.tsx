export const dynamic = "force-dynamic"

import Link from "next/link"
import { getMorningBoard } from "@/lib/actions/venue-ops"
import { getBelowPar } from "@/lib/actions/venue-stock"
import { VenueOpsBoard } from "@/components/venue-ops-board"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
const isVenue = (v: string | null): v is Venue => VENUES.includes(v as Venue)

export default async function VenueOpsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const v = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(v) ? v : "BURLEIGH"

  // Viewer left blank: everything assigned shows under "Waiting on <name>",
  // which is the honest read for a shared board.
  const [board, belowPar] = await Promise.all([
    getMorningBoard(venue, ""),
    getBelowPar(venue),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Morning board</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Everything reported, scheduled or below par. Put a name on anything
            without one; chase anything waiting on someone else.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {VENUES.map((x) => (
            <Link
              key={x}
              href={`/venue-ops?venue=${x}`}
              className={`rounded px-2.5 py-1 text-xs font-medium ${
                x === venue ? "bg-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              {VENUE_LABEL[x].replace(/\s*\(.*\)$/, "")}
            </Link>
          ))}
        </div>
      </div>
      <VenueOpsBoard board={board} belowPar={belowPar} />
    </div>
  )
}
