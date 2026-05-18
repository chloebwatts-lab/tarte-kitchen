export const dynamic = "force-dynamic"

import { getSuppliers } from "@/lib/actions/suppliers"
import {
  getInvoices,
  getPriceAlerts,
  getUnacknowledgedAlertCount,
  getUnitChangedAlerts,
} from "@/lib/actions/invoices"
import { getIngredients } from "@/lib/actions/ingredients"
import { SupplierDashboard } from "@/components/supplier-dashboard"

export default async function SuppliersPage() {
  const [suppliers, invoices, alerts, unitChangedAlerts, alertCount, ingredients] =
    await Promise.all([
      getSuppliers(),
      getInvoices(),
      getPriceAlerts(),
      getUnitChangedAlerts(),
      getUnacknowledgedAlertCount(),
      getIngredients(),
    ])

  return (
    <SupplierDashboard
      suppliers={suppliers}
      invoices={invoices}
      alerts={alerts}
      unitChangedAlerts={unitChangedAlerts}
      alertCount={alertCount}
      ingredients={ingredients}
    />
  )
}
