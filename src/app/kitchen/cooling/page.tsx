export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import {
  listActiveCoolingLogs,
  type CoolingLogRecord,
} from "@/lib/actions/cooling"
import { CoolingDashboard } from "@/components/kitchen/CoolingDashboard"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--tk-line)] pb-4">
        <Link
          href={`/kitchen?venue=${venue}`}
          className="inline-flex items-center gap-2 px-2 py-2 text-[14px] font-semibold text-[var(--tk-ink-soft)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {VENUE_LABEL[venue]}
        </Link>
        <KitchenLogo size={0.9} />
        <div className="w-[88px]" />
      </div>

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
