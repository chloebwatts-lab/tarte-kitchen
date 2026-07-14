export const dynamic = "force-dynamic"

import {
  listTrainingRecords,
  type TrainingRecordDto,
} from "@/lib/actions/training"
import { TrainingDashboard } from "@/components/kitchen/TrainingDashboard"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BURLEIGH"

  const records: TrainingRecordDto[] = await listTrainingRecords(venue)

  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Staff training" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Staff training
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Food handler training record, one per staff member. Managers tick
          items off as they are completed; a record is <strong>complete</strong>{" "}
          when every item is dated and verified. The council inspection folder
          reads from this list.
        </p>
      </div>

      <TrainingDashboard venue={venue} initialRecords={records} />
    </div>
  )
}
