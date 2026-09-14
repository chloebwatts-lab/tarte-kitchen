export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { ReportForm } from "@/components/kitchen/ReportForm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const isVenue = (v: string | null): v is Venue =>
  v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"

export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(p) ? p : isVenue(c) ? c : null
  if (!venue) return <KitchenVenuePicker />
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Spotted something" },
        ]}
      />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Spotted something?
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Ten seconds. Tap what it is, say where, done. It goes on the morning
          board so it gets seen, and you don&apos;t have to find a manager.
        </p>
      </div>
      <ReportForm venue={venue} />
    </div>
  )
}
