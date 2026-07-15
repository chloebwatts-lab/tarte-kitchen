export const dynamic = "force-dynamic"

import { listOpenAlerts } from "@/lib/actions/price-alerts"
import { PriceAlertsV2 } from "@/components/price-alerts-v2"

export default async function PriceAlertsPage() {
  const alerts = await listOpenAlerts()
  const rows = alerts.map((a) => ({
    id: a.id,
    ingredientId: a.ingredientId,
    ingredientName: a.ingredient.name,
    category: a.ingredient.category,
    stream: a.stream,
    currentPrice: Number(a.currentPrice),
    currentUnit: a.currentUnit,
    priorPrice: Number(a.priorPrice),
    priorPeriodMedian:
      a.priorPeriodMedian !== null ? Number(a.priorPeriodMedian) : null,
    changePct: Number(a.changePct),
    supplierName: a.supplierName,
    lastSeenAt: a.lastSeenAt.toISOString(),
  }))

  return (
    <div className="container max-w-4xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Price alerts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Two-stream supplier pricing watch. Stable items (pantry, dairy, dry
          goods) flag any ±5% move. Fruit &amp; veg only flag a sustained
          ≥25% jump above the 4-week median — single-week market spikes are
          suppressed.
        </p>
      </header>
      <PriceAlertsV2 alerts={rows} />
    </div>
  )
}
