export const dynamic = "force-dynamic"

import { db } from "@/lib/db"
import { OfficeHome } from "@/components/office-home"

/**
 * Tiled home for the office app: every page in the sidebar as a big
 * tap target, grouped, with live counts on the tiles that need a
 * decision. This is the start page of the installed "Tarte HQ" app.
 */
export default async function HomePage() {
  const [priceMoves, packQuestions, unassignedInvoices, overdueChecklists] = await Promise.all([
    db.productPriceAlert.count({ where: { status: "OPEN" } }),
    db.supplierProduct.count({ where: { status: "NEEDS_PACK", ingredientId: { not: null } } }),
    db.invoice.count({ where: { venue: null, status: { in: ["MATCHED", "EXTRACTED", "APPROVED"] } } }),
    db.checklistAlert.count({ where: { resolvedAt: null } }).catch(() => 0),
  ])
  return (
    <OfficeHome
      counts={{
        priceMoves: priceMoves + packQuestions,
        packQuestions,
        unassignedInvoices,
        overdueChecklists,
      }}
    />
  )
}
