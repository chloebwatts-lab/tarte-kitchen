export const dynamic = "force-dynamic"

import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { FixAssetList } from "@/components/kitchen/FixAssetList"
import { getFixAssets } from "@/lib/actions/maintenance"
import Link from "next/link"

type Venue = "BURLEIGH" | "BEACH_HOUSE"

export default async function FixHubPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  // Tea Garden gear lives under the Currumbin site in maintenance.
  const venue: Venue =
    venueParam === "BURLEIGH"
      ? "BURLEIGH"
      : venueParam === "BEACH_HOUSE" || venueParam === "TEA_GARDEN"
        ? "BEACH_HOUSE"
        : sp.venue === undefined
          ? "BURLEIGH"
          : "BURLEIGH"

  if (!venueParam) {
    return (
      <div className="space-y-8">
        <KitchenBreadcrumb crumbs={[{ label: "Venues", href: "/kitchen" }, { label: "Something broken?" }]} />
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Something broken?
        </div>
        <p className="text-[17px] text-[var(--tk-ink-soft)]">
          Best way: scan the QR sticker on the machine itself. Otherwise pick the venue.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(
            [
              ["BURLEIGH", "Tarte Bakery — Burleigh"],
              ["BEACH_HOUSE", "Beach House — Currumbin"],
            ] as const
          ).map(([v, label]) => (
            <Link
              key={v}
              href={`/kitchen/fix?venue=${v}`}
              className="rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-8 text-[22px] font-semibold text-[var(--tk-charcoal)] shadow-sm transition hover:border-[var(--tk-sage)]"
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
    )
  }

  const assets = await getFixAssets(venue)
  const venueLabel = venue === "BURLEIGH" ? "Burleigh" : "Beach House (Currumbin)"

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: "Something broken?", href: "/kitchen/fix" },
          { label: venueLabel },
        ]}
      />
      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Which machine?
        </div>
        <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">
          Tip: every machine has a QR sticker — scanning it with your phone camera skips straight to its page.
        </p>
      </div>
      <FixAssetList
        assets={assets.map((a) => ({
          slug: a.slug,
          name: a.name,
          aliases: a.aliases,
          location: a.location,
          category: a.category,
          manufacturer: a.manufacturer,
          photoUrl: a.photoUrl,
          openIssues: a.issues.length,
          hasSafetyIssue: a.issues.some((i) => i.isSafety),
        }))}
      />
    </div>
  )
}
