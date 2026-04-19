export const dynamic = "force-dynamic"

import { getPrepSheet } from "@/lib/actions/prep-sheet"
import { PrepSheetView } from "@/components/prep-sheet-view"

export default async function PrepSheetPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const date = typeof sp.date === "string" ? sp.date : undefined
  const venueParam = typeof sp.venue === "string" ? sp.venue : "ALL"
  const venue =
    venueParam === "BURLEIGH" ||
    venueParam === "BEACH_HOUSE" ||
    venueParam === "TEA_GARDEN"
      ? venueParam
      : "ALL"

  const sheet = await getPrepSheet({ venue, forDate: date })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prep Sheet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Production plan built from the last 4 same-weekday sales. Shows how
          many batches of each preparation to make and why.
        </p>
      </div>
      <PrepSheetView initial={sheet} />
    </div>
  )
}
