export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import Link from "next/link"
import { getSupplierOrderForm } from "@/lib/actions/supplier-order"
import { SupplierOrderForm } from "@/components/supplier-order-form"
import { Card, CardContent } from "@/components/ui/card"
import type { Venue } from "@/generated/prisma"

export default async function NewSupplierOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ supplierId: string }>
  searchParams: Promise<{ venue?: string }>
}) {
  const { supplierId } = await params
  const { venue: venueParam } = await searchParams
  const venue = (venueParam as Venue) || "BURLEIGH"

  const { supplier, lines } = await getSupplierOrderForm(supplierId, venue)
  if (!supplier) notFound()

  return (
    <div className="space-y-4">
      <div>
        <Link href="/orders/new" className="text-sm text-muted-foreground hover:underline">
          ← Back to suppliers
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Order from {supplier.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tick the items you want to order. Suggested quantities are pre-filled
          from par levels and recent invoices — adjust as needed, then send.
        </p>
      </div>
      {lines.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No items on this supplier&apos;s order form yet.
          </CardContent>
        </Card>
      ) : (
        <SupplierOrderForm
          supplier={supplier}
          initialVenue={venue}
          lines={lines}
        />
      )}
    </div>
  )
}
