export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { PreferredSupplier } from "@/components/kitchen/PreferredSupplier"
import { requireManager } from "@/lib/manager-auth"

export const metadata: Metadata = { title: "Where to order it · Tarte" }

export default async function PreferredSupplierPage() {
  await requireManager("/kitchen/managers/preferred")
  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Managers", href: "/kitchen/managers" }, { label: "Where to order it" }]} />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Where to order it
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Type a product. You get the supplier and pack we agreed to buy it from, and the
          dearer options we chose not to, with the difference per kilo or litre. Prices are the
          approved order-form prices ex GST. What we were actually charged is on{" "}
          <Link href="/kitchen/prices" className="font-semibold underline">Price check</Link>.
        </p>
      </div>
      <PreferredSupplier />
    </div>
  )
}
