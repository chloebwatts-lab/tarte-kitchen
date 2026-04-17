"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowUpRight,
  ArrowDownRight,
  Check,
  CheckCheck,
  ArrowRightLeft,
  AlertTriangle,
} from "lucide-react"
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  applyAndAcknowledgeAlert,
  applyAllPriceChanges,
} from "@/lib/actions/invoices"

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

export function SupplierPriceAlerts({ alerts }: { alerts: PriceAlert[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const unacknowledged = alerts.filter((a) => !a.acknowledged)
  const acknowledged = alerts.filter((a) => a.acknowledged)

  function handleAcknowledge(id: string) {
    startTransition(async () => {
      await acknowledgeAlert(id)
      router.refresh()
    })
  }

  function handleApplyAndAcknowledge(id: string) {
    startTransition(async () => {
      await applyAndAcknowledgeAlert(id)
      router.refresh()
    })
  }

  function handleAcknowledgeAll() {
    startTransition(async () => {
      await acknowledgeAllAlerts()
      router.refresh()
    })
  }

  function handleApplyAll() {
    startTransition(async () => {
      await applyAllPriceChanges()
      router.refresh()
    })
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            No price changes detected yet. Price alerts will appear here when
            invoices are processed and price differences are found.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {unacknowledged.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {unacknowledged.length} unreviewed change{unacknowledged.length !== 1 ? "s" : ""}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAcknowledgeAll}
              disabled={isPending}
            >
              <CheckCheck className="mr-2 h-3.5 w-3.5" />
              Acknowledge All
            </Button>
            <Button
              size="sm"
              onClick={handleApplyAll}
              disabled={isPending}
            >
              <ArrowRightLeft className="mr-2 h-3.5 w-3.5" />
              Apply All Changes
            </Button>
          </div>
        </div>
      )}

      {/* Unacknowledged alerts */}
      {unacknowledged.length > 0 && (
        <div className="space-y-2">
          {unacknowledged.map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              onAcknowledge={() => handleAcknowledge(alert.id)}
              onApply={() => handleApplyAndAcknowledge(alert.id)}
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Acknowledged alerts (collapsed) */}
      {acknowledged.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider pt-4">
            Previously Reviewed ({acknowledged.length})
          </p>
          {acknowledged.slice(0, 20).map((alert) => (
            <AlertRow
              key={alert.id}
              alert={alert}
              isPending={isPending}
              dimmed
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AlertRow({
  alert,
  onAcknowledge,
  onApply,
  isPending,
  dimmed,
}: {
  alert: PriceAlert
  onAcknowledge?: () => void
  onApply?: () => void
  isPending: boolean
  dimmed?: boolean
}) {
  const isIncrease = (alert.priceChangeAmount ?? 0) > 0
  const changeAbs = Math.abs(alert.priceChangePercent ?? 0)
  const severity = changeAbs > 5 ? "red" : changeAbs > 2 ? "amber" : "green"

  return (
    <div
      className={`flex items-center justify-between rounded-lg border border-border p-3 ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">
            {alert.ingredientName}
          </span>
          <Badge variant="secondary" className="text-[10px] shrink-0">
            {alert.supplierName}
          </Badge>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span>
            ${alert.previousPrice?.toFixed(2)} → ${alert.unitPrice.toFixed(2)}/{alert.unit}
          </span>
          {alert.invoiceNumber && (
            <>
              <span>·</span>
              <span>#{alert.invoiceNumber}</span>
            </>
          )}
          {alert.invoiceDate && (
            <>
              <span>·</span>
              <span>
                {new Date(alert.invoiceDate).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-1">
          {isIncrease ? (
            <ArrowUpRight className="h-4 w-4 text-red-500" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-green-500" />
          )}
          <Badge variant={severity}>
            {isIncrease ? "+" : ""}
            {alert.priceChangePercent?.toFixed(1)}%
          </Badge>
        </div>

        {!dimmed && onAcknowledge && onApply && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onAcknowledge}
              disabled={isPending}
              title="Acknowledge (dismiss without updating price)"
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              onClick={onApply}
              disabled={isPending}
              title="Apply price change and update recipes"
            >
              Apply
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
