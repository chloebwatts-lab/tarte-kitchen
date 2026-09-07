export const dynamic = "force-dynamic"

import { listPackQuestions, listProductAlerts } from "@/lib/actions/pricing"
import { PricingRebuild } from "@/components/pricing-rebuild"

export default async function PricingPage() {
  const [questions, alerts] = await Promise.all([listPackQuestions(), listProductAlerts()])
  return (
    <div className="container max-w-5xl py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Price alerts</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every supplier product carries one number, how much of the ingredient
          is in one billed unit, and every invoice line is priced per kg, per
          litre or per each from it. When a product is new or its pack changes,
          it asks one question here instead of guessing. Stable items flag a 5%
          move either way against the ingredient&apos;s current cost. Fruit and veg
          flag only when the last two deliveries both sit 25% above the
          four-week median.
        </p>
      </header>
      <PricingRebuild questions={questions} alerts={alerts} />
    </div>
  )
}
