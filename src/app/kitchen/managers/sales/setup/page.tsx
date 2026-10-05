export const dynamic = "force-dynamic"

import { requireManager } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { SalesNav } from "@/components/kitchen/SalesNav"
import { salesVenue } from "../_venue"
import { UpsellBoard } from "@/components/kitchen/UpsellBoard"
import { ChallengeManagers } from "@/components/kitchen/ChallengeManagers"
import { getSimpleChallenge, getUpsellBoard } from "@/lib/actions/upsell"

export default async function ChallengeSetupPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  await requireManager("/kitchen/managers/sales/setup")
  const venue = await salesVenue(await searchParams)
  const [upsell, simple] = await Promise.all([getUpsellBoard(venue), getSimpleChallenge(venue, "yesterday")])
  return (
    <div className="space-y-5">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Challenge", href: `/kitchen/managers/sales/challenge?venue=${venue}` }, { label: "Set up" }]} />
      <SalesNav current="challenge" venue={venue} />
      <VenueSwitch current={venue} />
      <ChallengeManagers key={`m-${venue}`} venue={venue} initial={simple.managers} />
      <UpsellBoard key={venue} initial={upsell} />
    </div>
  )
}
