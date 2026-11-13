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
  // (Oliver, 12 Nov 2026). Picked whatever the run status: ticking the last
  // line marks the run COMPLETED on the server and re-renders this page
  // before staff tap Complete, so a "not completed yet" test here dropped the
  // photo and no thank-you ever showed (Chloe 13 Nov 2026). The client keeps
  // the first photo it was given.
  const thankYouPhoto =
    isFohDailyClean({ area: run.area, name: run.templateName, cadence: run.cadence, isFoodSafety: run.isFoodSafety })
      ? await pickThankYouPhotoUrl(run.venue)
      : null
  return <KitchenRunView initial={run} thankYouPhoto={thankYouPhoto} />
}
