export const dynamic = "force-dynamic"

import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import {
  findOrCreateTodayDraftOrder,
  getOrderRunRows,
} from "@/lib/actions/order-checklist"
import { OrderRunView } from "@/components/order-run-view"
import type { Venue } from "@/generated/prisma"

export default async function OrderRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>
  searchParams: Promise<{ venue?: string; order?: string }>
}) {
  const { supplierId } = await params
  const { venue: venueParam, order: orderParam } = await searchParams
  const VALID_VENUES = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN", "BOTH"] as const
  const venue: Venue = (VALID_VENUES as readonly string[]).includes(venueParam ?? "")
    ? (venueParam as Venue)
    : "BURLEIGH"

  // Resolve to a specific draft order: explicit query param wins, otherwise
  // find-or-create today's draft for this (supplier, venue).
  const orderId = orderParam ?? (await findOrCreateTodayDraftOrder(supplierId, venue))

  // If we created a new draft and don't have ?order in URL, set it now so
  // refresh / bookmarking stays consistent.
  if (!orderParam) {
    redirect(`/order-checklists/${supplierId}?venue=${venue}&order=${orderId}`)
  }

  const { supplier, order, rows } = await getOrderRunRows(supplierId, orderId)
  if (!supplier || !order) notFound()

  return (
    <div className="space-y-4">
      <Link
        href={`/order-checklists?venue=${venue}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All suppliers
      </Link>

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Order from {supplier.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tick what you need. Quantities are in packs. Changes save as you go.
        </p>
      </div>

      <OrderRunView
        supplier={supplier}
        venue={venue}
        order={order}
        rows={rows}
      />
    </div>
  )
}
