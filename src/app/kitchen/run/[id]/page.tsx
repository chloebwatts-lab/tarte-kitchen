export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getChecklistRun } from "@/lib/actions/checklists"
import { KitchenRunView } from "@/components/kitchen-run-view"
import { isFohDailyClean } from "@/lib/checklists/thank-you"
import { pickThankYouPhotoUrl } from "@/lib/checklists/thank-you-photos"

export default async function KitchenRunPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const run = await getChecklistRun(id)
  if (!run) notFound()
  // FOH daily cleans finish on a "Thank you :)" page with a staff photo
  // (Oliver, 12 Nov 2026). Only picked for a run still to be finished.
  const thankYouPhoto =
    run.status !== "COMPLETED" &&
    isFohDailyClean({ area: run.area, name: run.templateName, cadence: run.cadence, isFoodSafety: run.isFoodSafety })
      ? await pickThankYouPhotoUrl(run.venue)
      : null
  return <KitchenRunView initial={run} thankYouPhoto={thankYouPhoto} />
}
