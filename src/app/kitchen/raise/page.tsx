export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getAgenda } from "@/lib/actions/meetings"
import { RaiseItemForm } from "@/components/kitchen/RaiseItemForm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

/**
 * Next management meeting: quarterly, third Friday, Beach House, 3:30pm.
 * Derived rather than stored so the page never shows a date that has passed.
 */
function nextMeeting(from = new Date()): Date {
  const d = new Date(from)
  for (let i = 0; i < 400; i++) {
    const month = d.getMonth()
    // Quarter months matching the 18 Sep 2026 series: Mar, Jun, Sep, Dec.
    if (month % 3 === 2) {
      const first = new Date(d.getFullYear(), month, 1)
      const offset = (5 - first.getDay() + 7) % 7
      const thirdFriday = new Date(d.getFullYear(), month, 1 + offset + 14)
      if (thirdFriday >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
        return thirdFriday
      }
    }
    d.setMonth(d.getMonth() + 1, 1)
  }
  return from
}

export default async function RaisePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const cookieVenue = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(venueParam)
    ? venueParam
    : isVenue(cookieVenue)
      ? cookieVenue
      : null
  if (!venue) return <KitchenVenuePicker />

  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const agenda = await getAgenda()
  const meeting = nextMeeting()

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Raise something" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Raise something
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Anything you want talked about at the next management meeting. It goes
          straight on the agenda, nobody approves it first, and you will see what
          was decided.
        </p>
      </div>

      <RaiseItemForm
        venue={venue}
        meetingDate={meeting.toISOString()}
        open={agenda.open}
      />
    </div>
  )
}
