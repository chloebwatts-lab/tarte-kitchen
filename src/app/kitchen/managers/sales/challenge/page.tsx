export const dynamic = "force-dynamic"

import { requireManager } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { SalesNav } from "@/components/kitchen/SalesNav"
import { salesVenue } from "../_venue"
import { ChallengeSimple } from "@/components/kitchen/ChallengeSimple"
import { getSimpleChallenge } from "@/lib/actions/upsell"

export default async function ChallengePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireManager("/kitchen/managers/sales/challenge")
  const venue = await salesVenue(await searchParams)
  const initial = await getSimpleChallenge(venue, "today")
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Challenge" }]} />
      <SalesNav current="challenge" venue={venue} />
      <VenueSwitch current={venue} />
      <ChallengeSimple key={venue} initial={initial} />
      <a href={`/kitchen/managers/sales/setup?venue=${venue}`} className="block px-1 text-[14px] font-semibold text-[var(--tk-ink-soft)] underline underline-offset-2">
        Set up: start a challenge, what counts, who the managers are
      </a>
    </div>
  )
}
