"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FileText, ChevronDown, ChevronUp, AlertTriangle, Link2 } from "lucide-react"
import { getInvoice, createManualMapping } from "@/lib/actions/invoices"

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

interface IngredientOption {
  id: string
  name: string
}

interface InvoiceDetail {
  lineItems: Array<{
    id: string
    description: string
    quantity: number
    unit: string
    unitPrice: number
    lineTotal: number
    ingredientId: string | null
    ingredientName: string | null
    priceChanged: boolean
    previousPrice: number | null
    priceChangePercent: number | null
    acknowledged: boolean
  }>
}

const statusConfig: Record<string, { label: string; variant: "green" | "amber" | "red" | "secondary" }> = {
  PROCESSED: { label: "Processed", variant: "green" },
  NEEDS_REVIEW: { label: "Needs Review", variant: "amber" },
  FAILED: { label: "Failed", variant: "red" },
  PENDING: { label: "Pending", variant: "secondary" },
}

export function SupplierInvoices({
  invoices,
  ingredients,
}: {
  invoices: InvoiceSummary[]
  ingredients: IngredientOption[]
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  async function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null)
      setInvoiceDetail(null)
      return
    }

    setExpandedId(id)
    setLoadingDetail(true)
    try {
      const detail = await getInvoice(id)
      setInvoiceDetail(detail)
    } finally {
      setLoadingDetail(false)
    }
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileText className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            No invoices processed yet. Connect your Gmail and set supplier email
            addresses to start monitoring invoices automatically.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-2">
      {invoices.map((inv) => {
        const status = statusConfig[inv.status] ?? statusConfig.PENDING
        const isExpanded = expandedId === inv.id

        return (
          <div key={inv.id} className="rounded-lg border border-border">
            <button
              onClick={() => toggleExpand(inv.id)}
              className="flex w-full items-center justify-between p-3 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Badge variant={status.variant}>{status.label}</Badge>
                <div className="min-w-0">
                  <span className="text-sm font-medium">{inv.supplierName}</span>
                  {inv.invoiceNumber && (
                    <span className="text-xs text-muted-foreground ml-2">
                      #{inv.invoiceNumber}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {inv.totalAmount !== null && (
                  <span className="text-sm font-medium">
                    ${inv.totalAmount.toFixed(2)}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {inv.lineItemCount} item{inv.lineItemCount !== 1 ? "s" : ""}
                </span>
                {inv.invoiceDate && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(inv.invoiceDate).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-border p-3">
                {loadingDetail ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    Loading line items...
                  </p>
                ) : invoiceDetail ? (
                  <LineItemsTable
                    lineItems={invoiceDetail.lineItems}
                    ingredients={ingredients}
                  />
                ) : null}

                {inv.errorMessage && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    {inv.errorMessage}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function LineItemsTable({
  lineItems,
  ingredients,
}: {
  lineItems: InvoiceDetail["lineItems"]
  ingredients: IngredientOption[]
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th className="text-left py-2 pr-2">Description</th>
            <th className="text-right py-2 px-2">Qty</th>
            <th className="text-left py-2 px-2">Unit</th>
            <th className="text-right py-2 px-2">Unit Price</th>
            <th className="text-right py-2 px-2">Total</th>
            <th className="text-left py-2 pl-2">Mapped To</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((item) => (
            <tr
              key={item.id}
              className={`border-b border-border/50 ${
                item.priceChanged && !item.acknowledged
                  ? "bg-amber-50"
                  : item.ingredientId === null
                  ? "bg-muted/30"
                  : ""
              }`}
            >
              <td className="py-2 pr-2">
                <div className="flex items-center gap-1">
                  {item.description}
                  {item.priceChanged && (
                    <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                  )}
                </div>
                {item.priceChanged && item.previousPrice !== null && (
                  <span className="text-xs text-amber-600">
                    was ${item.previousPrice.toFixed(2)} ({item.priceChangePercent?.toFixed(1)}%)
                  </span>
                )}
              </td>
              <td className="text-right py-2 px-2">{item.quantity}</td>
              <td className="py-2 px-2">{item.unit}</td>
              <td className="text-right py-2 px-2">
                ${item.unitPrice.toFixed(2)}
              </td>
              <td className="text-right py-2 px-2">
                ${item.lineTotal.toFixed(2)}
              </td>
              <td className="py-2 pl-2">
                {item.ingredientId ? (
                  <Badge variant="green" className="text-[10px]">
                    <Link2 className="h-2.5 w-2.5 mr-1" />
                    {item.ingredientName}
                  </Badge>
                ) : (
                  <MappingSelect
                    lineItemId={item.id}
                    ingredients={ingredients}
                  />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MappingSelect({
  lineItemId,
  ingredients,
}: {
  lineItemId: string
  ingredients: IngredientOption[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleMap(ingredientId: string) {
    startTransition(async () => {
      await createManualMapping(lineItemId, ingredientId)
      router.refresh()
    })
  }

  return (
    <Select onValueChange={handleMap} disabled={isPending}>
      <SelectTrigger className="h-7 w-[160px] text-xs">
        <SelectValue placeholder="Map to ingredient..." />
      </SelectTrigger>
      <SelectContent>
        {ingredients.map((ing) => (
          <SelectItem key={ing.id} value={ing.id} className="text-xs">
            {ing.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
