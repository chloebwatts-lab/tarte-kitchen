export const dynamic = "force-dynamic"

import { PastryOrders } from "@/components/kitchen/PastryOrders"
import { getPastryBoard } from "@/lib/actions/pastry-orders"

/**
 * Pastry Orders (Shawna, 28 Nov 2026): her Claude tracker rebuilt here so
 * staff open it with their own sign in. On trial beside the tracker; the
 * Pastry tile still opens Cake orders until she switches it.
 */
export default async function PastryOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const q = typeof sp.q === "string" ? sp.q.slice(0, 80) : ""
  const board = await getPastryBoard()
  return <PastryOrders board={board} initialQuery={q} />
}
