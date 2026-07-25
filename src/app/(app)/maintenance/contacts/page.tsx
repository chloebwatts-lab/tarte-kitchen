export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { db } from "@/lib/db"
import { MaintenanceContactsEditor } from "@/components/maintenance-contacts-editor"

export default async function MaintenanceContactsPage() {
  const contacts = await db.maintenanceContact.findMany({
    orderBy: { sortOrder: "asc" },
  })

  return (
    <div className="container max-w-4xl py-6 space-y-6">
      <header>
        <Link
          href="/maintenance"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Maintenance
        </Link>
        <h1 className="text-2xl font-semibold">Trade contacts</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Who gets called for what. Specialties drive the suggestions on the staff fix
          pages: dishwasher, refrigeration, ice-machine, gas, oven, coffee, general,
          warranty, supplier.
        </p>
      </header>
      <MaintenanceContactsEditor
        contacts={contacts.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company,
          phone: c.phone,
          email: c.email,
          specialties: c.specialties,
          notes: c.notes,
        }))}
      />
    </div>
  )
}
