import { redirect } from "next/navigation"
import { startChecklistRun } from "@/lib/actions/checklists"
import { Venue } from "@/generated/prisma"

export default async function StartKitchenRun({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : "BURLEIGH"
  const venue =
    venueParam === "BURLEIGH" ||
    venueParam === "BEACH_HOUSE" ||
    venueParam === "TEA_GARDEN"
      ? (venueParam as Venue)
      : ("BURLEIGH" as Venue)
  const runId = await startChecklistRun({ templateId: id, venue })
  redirect(`/kitchen/run/${runId}`)
}
