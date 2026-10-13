export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { PriceCheck } from "@/components/kitchen/PriceCheck"
import { requireFullManager } from "@/lib/manager-auth"
import { requirePage } from "@/lib/tier-auth"

export const metadata: Metadata = {
  title: "Price check · Tarte",
}

export default async function KitchenPricesPage() {
  // Supplier prices are manager tier (Chloe, 20 Sep 2026).
  await requireFullManager("/kitchen/prices")
  // Senior tier and the copy-quiet list (src/lib/access/tiers.ts).
  await requirePage("/kitchen/prices")
  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: "Price check" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Price check
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          What we last paid for an ingredient, at each venue, and who from.
          Straight off our invoices. Handy for spotting when one venue is
          paying more than the other for the same thing.
        </p>
      </div>

      <PriceCheck />
    </div>
  )
}
