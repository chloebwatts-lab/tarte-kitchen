export const dynamic = "force-dynamic"

import { listOrders, suggestOrders } from "@/lib/actions/orders"
import { OrdersView } from "@/components/orders-view"

export default async function OrdersPage() {
  const [orders, suggestions] = await Promise.all([
    listOrders({}),
    suggestOrders({ venue: "ALL" }),
  ])
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Auto-generated purchase orders from par levels, on-hand stock, and
          forecasted usage. Review, edit, and submit to each supplier.
        </p>
      </div>
      <OrdersView orders={orders} suggestions={suggestions} />
    </div>
  )
}
