"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { SupplierPriceAlerts } from "@/components/supplier-price-alerts"
import { SupplierInvoices } from "@/components/supplier-invoices"
import { SuppliersContent } from "@/components/suppliers-content"
import { SupplierPriceHistory } from "@/components/supplier-price-history"
import { SupplierOrderForms } from "@/components/supplier-order-forms"

interface Supplier {
  id: string
  name: string
  contact: string | null
  phone: string | null
  email: string | null
  notes: string | null
  ingredientCount: number
}

interface InvoiceSummary {
  id: string
  supplierId: string | null
  supplierName: string
  invoiceNumber: string | null
  invoiceDate: string | null
  totalAmount: number | null
  status: string
  errorMessage: string | null
  lineItemCount: number
  priceChanges: number
  createdAt: string
}

interface PriceAlert {
  id: string
  invoiceId: string
  invoiceNumber: string | null
  invoiceDate: string | null
  supplierName: string
  supplierId: string | null
  description: string
  ingredientId: string | null
  ingredientName: string
  quantity: number
  unit: string
  unitPrice: number
  previousPrice: number | null
  priceChangeAmount: number | null
  priceChangePercent: number | null
  acknowledged: boolean
  createdAt: string
}

interface IngredientOption {
  id: string
  name: string
}

interface UnitChangedAlert {
  id: string
  invoiceId: string
  invoiceNumber: string | null
  invoiceDate: string | null
  supplierName: string
  supplierId: string | null
  description: string
  ingredientId: string | null
  ingredientName: string
  storedUnit: string
  storedQuantity: number
  storedUnitPrice: number
  invoiceUnit: string
  invoiceUnitPrice: number
  suggestedConversionFactor: number | null
}

interface Props {
  suppliers: Supplier[]
  invoices: InvoiceSummary[]
  alerts: PriceAlert[]
  unitChangedAlerts: UnitChangedAlert[]
  alertCount: number
  ingredients: IngredientOption[]
}

export function SupplierDashboard({
  suppliers,
  invoices,
  alerts,
  unitChangedAlerts,
  alertCount,
  ingredients,
}: Props) {
  const unacknowledgedCount =
    alerts.filter((a) => !a.acknowledged).length + unitChangedAlerts.length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">Suppliers</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Invoice monitoring, price tracking, and supplier management
          </p>
        </div>
        <a
          href="/suppliers/replies"
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50"
        >
          Recent supplier replies →
        </a>
      </div>

      {unacknowledgedCount > 0 && (
        <div className="rounded-lg border border-amber-text/20 bg-amber-light p-4">
          <div className="flex items-center gap-2">
            <span className="text-amber-text font-medium">
              {unacknowledgedCount} unreviewed price change{unacknowledgedCount !== 1 ? "s" : ""} detected
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-text">
            Review changes in the Price Alerts tab below
          </p>
        </div>
      )}

      <Tabs defaultValue={unacknowledgedCount > 0 ? "alerts" : "suppliers"}>
        <TabsList>
          <TabsTrigger value="alerts" className="gap-2">
            Price Alerts
            {unacknowledgedCount > 0 && (
              <Badge variant="red" className="ml-1 h-5 min-w-[20px] px-1.5 text-[10px]">
                {unacknowledgedCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="forms">Order Forms</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <SupplierPriceAlerts alerts={alerts} unitChangedAlerts={unitChangedAlerts} />
        </TabsContent>

        <TabsContent value="invoices">
          <SupplierInvoices invoices={invoices} ingredients={ingredients} />
        </TabsContent>

        <TabsContent value="suppliers">
          <SuppliersContent suppliers={suppliers} />
        </TabsContent>

        <TabsContent value="forms">
          <SupplierOrderForms
            suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          />
        </TabsContent>

        <TabsContent value="history">
          <SupplierPriceHistory alerts={alerts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
