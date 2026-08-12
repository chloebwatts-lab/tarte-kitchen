export const dynamic = "force-dynamic"

import { getProfitSensitivityDefaults } from "@/lib/actions/profit-sensitivity"
import { ProfitSensitivityCalculator } from "@/components/profit-sensitivity-calculator"

export default async function PriceSensitivityPage() {
  const defaults = await getProfitSensitivityDefaults()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">
          Price Sensitivity
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          What a price change does to gross profit, and how much volume a
          price rise can afford to lose (or a discount has to win) before it
          stops paying.
        </p>
      </div>
      <ProfitSensitivityCalculator initial={defaults} />
    </div>
  )
}
