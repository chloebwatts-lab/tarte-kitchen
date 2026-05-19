export const dynamic = "force-dynamic"

import Link from "next/link"
import { listOrders, suggestOrders } from "@/lib/actions/orders"
import { OrdersView } from "@/components/orders-view"
import { Button } from "@/components/ui/button"

export default async function OrdersPage() {
  const [orders, suggestions] = await Promise.all([
    listOrders({}),
    suggestOrders({ venue: "ALL" }),
  ])
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Place a new order from a supplier&apos;s form, or review the auto-suggestions
            generated from par + on-hand + forecast usage below.
          </p>
        </div>
        <Button asChild>
          <Link href="/orders/new">New order</Link>
        </Button>
      </div>
      <OrdersView orders={orders} suggestions={suggestions} />
    </div>
  )
}
