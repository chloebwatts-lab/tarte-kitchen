export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { getEodSheet } from "@/lib/actions/dept-orders"
import { DeptOrderSheet } from "@/components/kitchen/DeptOrderSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function EodOrderSheetPage({
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

  const sheet = await getEodSheet(venue)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Ordering", href: `/kitchen/order?venue=${venue}` },
          { label: "Order sheet" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Order sheet
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Every section&apos;s approved list for {venueLabel}, regrouped by
          supplier. Each supplier gets one order covering all sections. Check
          it, then send.
        </p>
        <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
          {sheet.dateLabel}
        </p>
      </div>

      <DeptOrderSheet initialSheet={sheet} />
    </div>
  )
}
