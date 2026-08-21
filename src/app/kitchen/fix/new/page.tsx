export const dynamic = "force-dynamic"

import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { NewMachineForm } from "@/components/kitchen/NewMachineForm"
import { getVenueLocations } from "@/lib/actions/maintenance"

/**
 * Staff quick-add: get a new machine into the register (and a QR sticker on
 * it) in under a minute, no admin login needed. Machines bought through the
 * usual suppliers are auto-created from their invoices by the
 * check-equipment-emails sweep — this page covers everything else (cash 'n'
 * carry buys, hand-me-downs, anything the sweep missed).
 */
export default async function NewMachinePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const initialVenue = sp.venue === "BURLEIGH" ? "BURLEIGH" : "BEACH_HOUSE"

  const [burleigh, beachHouse] = await Promise.all([
    getVenueLocations("BURLEIGH"),
    getVenueLocations("BEACH_HOUSE"),
  ])

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: "Maintenance", href: "/kitchen/fix" },
          { label: "New machine" },
        ]}
      />

      <div className="px-1">
        <div className="tk-caps text-[13px] text-[var(--tk-ink-mute)]">Maintenance</div>
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          New machine
        </div>
        <p className="mt-2 max-w-2xl text-[15px] leading-snug text-[var(--tk-ink-soft)]">
          Got a new (or newly discovered) machine? Add it here and you&apos;ll get its
          QR sticker straight away. Takes a minute, the data plate photo is the
          most valuable part.
        </p>
      </div>

      <NewMachineForm
        initialVenue={initialVenue}
        locationsByVenue={{ BURLEIGH: burleigh, BEACH_HOUSE: beachHouse }}
      />
    </div>
  )
}
