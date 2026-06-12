export const dynamic = "force-dynamic"

import {
  getAllergenVerificationRows,
  getAllergenProgress,
} from "@/lib/actions/allergen-verification"
import { AllergenVerificationTable } from "@/components/allergen-verification-table"
import { BackLink } from "@/components/ui/back-link"

export default async function AllergenVerificationPage() {
  const [rows, progress] = await Promise.all([
    getAllergenVerificationRows(),
    getAllergenProgress(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <BackLink href="/ingredients" label="Ingredients" />
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Allergen verification
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Check the product label, tick the declared allergens, and verify.
          The inbox email agent only makes &ldquo;free from&rdquo; claims for
          dishes where every ingredient is verified.
        </p>
      </div>

      <AllergenVerificationTable rows={rows} progress={progress} />
    </div>
  )
}
