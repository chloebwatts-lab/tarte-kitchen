export const dynamic = "force-dynamic"

import { notFound } from "next/navigation"
import { getOrder } from "@/lib/actions/orders"
import { OrderDetailView } from "@/components/order-detail-view"

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const order = await getOrder(id)
  if (!order) notFound()
  return <OrderDetailView initial={order} />
}
