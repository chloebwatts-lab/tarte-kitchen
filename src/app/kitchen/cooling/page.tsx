export const dynamic = "force-dynamic"

import {
  listActiveCoolingLogs,
  type CoolingLogRecord,
} from "@/lib/actions/cooling"
import { CoolingDashboard } from "@/components/kitchen/CoolingDashboard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function CoolingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BURLEIGH"

  const logs: CoolingLogRecord[] = await listActiveCoolingLogs(venue)

  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Cooling log" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Cooling log
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Record cooked items going into the cool room. App reminds you at the
          2-hour and 6-hour temperature checkpoints. Targets:{" "}
          <strong>≤ 21 °C at 2 hr</strong>, <strong>≤ 5 °C at 6 hr</strong>.
        </p>
      </div>

      <CoolingDashboard venue={venue} initialLogs={logs} />
    </div>
  )
}
