export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getLineUp, getLineUpStreak } from "@/lib/actions/lineup"
import { LineUpBoard } from "@/components/kitchen/LineUpBoard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

const dayLabel = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "Australia/Brisbane",
})

export default async function LineUpPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  // Explicit ?venue= wins; otherwise the venue the picker remembered.
  // Never silently default to a venue.
  const cookieVenue = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(venueParam)
    ? venueParam
    : isVenue(cookieVenue)
      ? cookieVenue
      : null
  if (!venue) return <KitchenVenuePicker />

  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const [lineUp, streak] = await Promise.all([
    getLineUp(venue),
    getLineUpStreak(venue),
  ])

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Line-up" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Line-up
        </div>
        <p className="mt-2 text-[15px] text-[var(--tk-ink-soft)]">
          {dayLabel.format(new Date())} &nbsp;&middot;&nbsp; {venueLabel}
        </p>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Five minutes, standing, before open. Read it top to bottom and
          you&apos;ve run it. Everything except the push item and the 86s is
          already filled in for you.
        </p>
      </div>

      <LineUpBoard lineUp={lineUp} streak={streak} />
    </div>
  )
}
