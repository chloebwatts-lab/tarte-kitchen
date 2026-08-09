export const dynamic = "force-dynamic"

import { getServicePrograms } from "@/lib/actions/services"
import { ServicesAdmin } from "@/components/services-admin"

export default async function ServicesAdminPage() {
  const programs = await getServicePrograms({ includeInactive: true })

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Service calendar</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Recurring venue services, grease trap, pest control, canopy cleans, fire
          checks. Visits are picked up automatically from service invoices and
          booking emails in accounts@; anything auto-detected waits here for a
          quick confirm. Staff see the same calendar at /kitchen/services.
        </p>
      </header>
      <ServicesAdmin programs={programs} />
    </div>
  )
}
