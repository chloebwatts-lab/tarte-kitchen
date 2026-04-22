export const dynamic = "force-dynamic"

import { getWasteFormItems } from "@/lib/actions/wastage"
import { WasteEntryForm } from "@/components/waste-entry-form"
import { BackLink } from "@/components/ui/back-link"

export default async function NewWasteEntryPage() {
  const items = await getWasteFormItems()

  return (
    <div className="space-y-6">
      <BackLink href="/wastage" label="Back to wastage" />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Log Waste</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Record wasted items to track and reduce food waste
        </p>
      </div>
      <WasteEntryForm items={items} />
    </div>
  )
}
