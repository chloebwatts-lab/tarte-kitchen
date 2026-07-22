export const dynamic = "force-dynamic"

import { getRestockReport, listPrepStockItems } from "@/lib/actions/restock"
import { RestockAdminView } from "@/components/restock-admin-view"

export default async function RestockAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venue =
    sp.venue === "BURLEIGH" || sp.venue === "TEA_GARDEN"
      ? sp.venue
      : ("BEACH_HOUSE" as const)
  const date =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : undefined

  const [items, report] = await Promise.all([
    listPrepStockItems(venue),
    getRestockReport({ venue, date }),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Restock &amp; prep counts
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The head chef&apos;s prep system: closing chefs count each kitchen
          nightly, the prep chef restocks from one consolidated run, and the
          daily report shows counted vs requested vs supplied. Manage the item
          catalogue here — chefs use the kiosk at{" "}
          <a
            href={`/kitchen/restock?venue=${venue}`}
            className="underline underline-offset-2"
          >
            /kitchen/restock
          </a>
          .
        </p>
      </div>
      <RestockAdminView venue={venue} items={items} report={report} />
    </div>
  )
}
