export const dynamic = "force-dynamic"

import Link from "next/link"
import { requireGm } from "@/lib/gm-auth"
import { listThankYouPhotos } from "@/lib/actions/thank-you"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { GmThankYouPhotos } from "@/components/kitchen/GmThankYouPhotos"
import { cn } from "@/lib/utils"

const VENUES = [
  { key: "BURLEIGH", label: "Burleigh" },
  { key: "BEACH_HOUSE", label: "Beach House" },
  { key: "TEA_GARDEN", label: "Tea Garden" },
] as const

export default async function GmPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ venue?: string }>
}) {
  const sp = await searchParams
  const venue = VENUES.find((v) => v.key === sp.venue)?.key ?? "BURLEIGH"
  await requireGm(`/kitchen/gm/photos?venue=${venue}`)
  const photos = await listThankYouPhotos(venue)
  const label = VENUES.find((v) => v.key === venue)!.label

  return (
    <div className="mx-auto max-w-[860px] space-y-7 pb-16">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Thank-you photos" }]} />
      <div className="px-1">
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>
          Thank-you photos
        </h1>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          When someone finishes an FOH daily checklist in full (every line ticked, photos in, Complete tapped) they get a &ldquo;Thank you :)&rdquo; page with one of these, picked at random. Add as many as you like.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-[14px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-1">
        {VENUES.map((v) => (
          <Link
            key={v.key}
            href={`/kitchen/gm/photos?venue=${v.key}`}
            className={cn(
              "rounded-[10px] px-2 py-3 text-center text-[16px] font-semibold",
              v.key === venue ? "bg-[var(--tk-charcoal)] text-white" : "text-[var(--tk-ink-soft)]",
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <GmThankYouPhotos key={venue} venue={venue} venueLabel={label} initial={photos} />
    </div>
  )
}
