export const dynamic = "force-dynamic"

import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { PastryGallery } from "@/components/kitchen/PastryGallery"
import { listPastryGallery } from "@/lib/actions/pastry-section"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import { pastryVenue } from "../venue"

export default async function PastryProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const venue = await pastryVenue(await searchParams)
  if (!venue) return <KitchenVenuePicker />
  const products = await listPastryGallery(venue)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: `Pastry, ${VENUE_SHORT_LABEL[venue]}`, href: `/kitchen/pastry?venue=${venue}` },
          { label: "Products" },
        ]}
      />
      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Pastry products
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          How every finished product should look. Tap one to see its photos, or to add one.
        </p>
      </div>
      <PastryGallery products={products} />
    </div>
  )
}
