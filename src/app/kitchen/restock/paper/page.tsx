export const dynamic = "force-dynamic"

import { getCountSheet } from "@/lib/actions/restock"
import { RestockPaperSheet } from "@/components/kitchen/RestockPaperSheet"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"
import { STATION_LABEL, isKitchenStation } from "@/lib/stations"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

/**
 * Paper-style alternative to the standard evening count — the same sheet
 * records and autosave, laid out like Jose's printed restock request so a
 * chef can fill it in with an Apple Pencil (iPad Scribble turns handwriting
 * into digits right in the boxes — no photo, no transcription).
 */
export default async function RestockPaperPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const stationParam = typeof sp.station === "string" ? sp.station : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BEACH_HOUSE"
  const station = isKitchenStation(stationParam) ? stationParam : "MAIN"

  const sheet = await getCountSheet({ venue, station })
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Restock & prep", href: `/kitchen/restock?venue=${venue}` },
          { label: `${STATION_LABEL[station]} — paper sheet` },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          {STATION_LABEL[station]} — restock sheet
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          The paper sheet, on the iPad. Write straight into the boxes with the
          Apple Pencil — the iPad turns your handwriting into numbers as you
          go, so check the box shows what you meant. Count{" "}
          <strong>backup prep in the coolroom</strong>{" "}only, leave
          &ldquo;Need&rdquo; empty when you&apos;re fine. It saves as you
          write.
        </p>
        <p className="mt-2 text-[14px] text-[var(--tk-ink-soft)]">
          Prefer tapping?{" "}
          <a
            href={`/kitchen/restock/count?venue=${venue}&station=${station}`}
            className="font-medium text-[var(--tk-charcoal)] underline underline-offset-2"
          >
            Use the standard count instead
          </a>
          . Both fill in the same sheet.
        </p>
      </div>

      <RestockPaperSheet initialSheet={sheet} />
    </div>
  )
}
