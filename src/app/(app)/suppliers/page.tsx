export const dynamic = "force-dynamic"

import { getSuppliers } from "@/lib/actions/suppliers"
import { getInvoices, getPriceAlerts, getUnacknowledgedAlertCount } from "@/lib/actions/invoices"
import { getIngredients } from "@/lib/actions/ingredients"
import { SupplierDashboard } from "@/components/supplier-dashboard"

export default async function SuppliersPage() {
  const [suppliers, invoices, alerts, alertCount, ingredients] = await Promise.all([
    getSuppliers(),
    getInvoices(),
    getPriceAlerts(),
    getUnacknowledgedAlertCount(),
    getIngredients(),
  ])

  return (
    <SupplierDashboard
      suppliers={suppliers}
      invoices={invoices}
      alerts={alerts}
      alertCount={alertCount}
      ingredients={ingredients}
    />
  )
}
