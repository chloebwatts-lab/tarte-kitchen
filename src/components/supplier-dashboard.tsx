"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { SupplierPriceAlerts } from "@/components/supplier-price-alerts"
import { SupplierInvoices } from "@/components/supplier-invoices"
import { SuppliersContent } from "@/components/suppliers-content"
import { SupplierPriceHistory } from "@/components/supplier-price-history"

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
  supplierId: string
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
  supplierId: string
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

interface Props {
  suppliers: Supplier[]
  invoices: InvoiceSummary[]
  alerts: PriceAlert[]
  alertCount: number
  ingredients: IngredientOption[]
}

export function SupplierDashboard({
  suppliers,
  invoices,
  alerts,
  alertCount,
  ingredients,
}: Props) {
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Suppliers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoice monitoring, price tracking, and supplier management
        </p>
      </div>

      {unacknowledgedCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <span className="text-amber-800 font-medium">
              {unacknowledgedCount} unreviewed price change{unacknowledgedCount !== 1 ? "s" : ""} detected
            </span>
          </div>
          <p className="mt-1 text-sm text-amber-700">
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
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <SupplierPriceAlerts alerts={alerts} />
        </TabsContent>

        <TabsContent value="invoices">
          <SupplierInvoices invoices={invoices} ingredients={ingredients} />
        </TabsContent>

        <TabsContent value="suppliers">
          <SuppliersContent suppliers={suppliers} />
        </TabsContent>

        <TabsContent value="history">
          <SupplierPriceHistory alerts={alerts} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
