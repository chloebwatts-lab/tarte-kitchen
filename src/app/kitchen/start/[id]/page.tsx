import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { startChecklistRun } from "@/lib/actions/checklists"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { Venue } from "@/generated/prisma/client"

const isVenue = (v: string | null | undefined): v is Venue =>
  v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"

/**
 * Starts a checklist run and jumps into it. The venue comes from the link
 * or the device's remembered venue, never a default: a stale bookmark must
 * not quietly file Beach House cleaning against Burleigh.
 */
export default async function StartKitchenRun({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { id } = await params
  const sp = await searchParams
  const p = typeof sp.venue === "string" ? sp.venue : null
  const c = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(p) ? p : isVenue(c) ? c : null
  if (!venue) return <KitchenVenuePicker />

  const runId = await startChecklistRun({ templateId: id, venue })
  redirect(`/kitchen/run/${runId}`)
}
