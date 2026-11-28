export const dynamic = "force-dynamic"

import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { CakeOrders } from "@/components/kitchen/CakeOrders"
import { getCakeBoard } from "@/lib/actions/cake-orders"
import { isCakeVenue } from "@/lib/cakes/shared"

/** Cake orders (Shawna, 26 Nov 2026). Every venue by default: one list for pastry and the counter. */
export default async function CakeOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : null)
  const view = one("view") === "past" ? "past" : "upcoming"
  const atRaw = one("at")
  const at = isCakeVenue(atRaw) ? atRaw : null
  const board = await getCakeBoard(view)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: "Pastry", href: "/kitchen/pastry" },
          { label: "Cake orders" },
        ]}
      />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Cake orders
        </div>
        <p className="mt-2 text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Cakes, pies, tarts and pre-orders being picked up, by day. Website orders come in by themselves; add counter, phone and function orders here.
        </p>
      </div>
      <CakeOrders board={board} view={view} at={at} openId={one("open")} orderRef={one("order")} />
    </div>
  )
}
