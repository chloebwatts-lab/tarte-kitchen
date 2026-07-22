"use client"

import { useState, useTransition } from "react"
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
  Ruler,
  X,
} from "lucide-react"
import {
  acknowledgeAlert,
  acknowledgeAllAlerts,
  applyAndAcknowledgeAlert,
  applyAllPriceChanges,
  confirmConversion,
  rejectAndIgnoreMapping,
} from "@/lib/actions/invoices"

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

export function SupplierPriceAlerts({
  alerts,
  unitChangedAlerts = [],
}: {
  alerts: PriceAlert[]
  unitChangedAlerts?: UnitChangedAlert[]
}) {
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

  function handleReject(id: string, ingredientName: string, supplierName: string) {
    if (
      !confirm(
        `Reject this match? "${ingredientName}" (${supplierName}) won't be linked to this invoice description again — future invoices will re-run through the matcher.`
      )
    ) {
      return
    }
    startTransition(async () => {
      await rejectAndIgnoreMapping(id)
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

  if (alerts.length === 0 && unitChangedAlerts.length === 0) {
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
      {unitChangedAlerts.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Ruler className="h-4 w-4 text-amber-text" />
            <p className="text-sm font-medium text-amber-text">
              Pack / unit changed — needs remap ({unitChangedAlerts.length})
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            These lines came in with a different unit to what's stored, so the
            price isn't comparable like-for-like. Confirm how many stored units
            are in one invoice unit and the price flows through normally.
          </p>
          {unitChangedAlerts.map((alert) => (
            <UnitChangedRow key={alert.id} alert={alert} isPending={isPending} />
          ))}
        </div>
      )}

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
              onReject={() =>
                handleReject(alert.id, alert.ingredientName, alert.supplierName)
              }
              isPending={isPending}
            />
          ))}
        </div>
      )}

      {/* Acknowledged alerts (collapsed) */}
      {acknowledged.length > 0 && (
        <div className="space-y-2">
          <p className="font-serif text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.14em] pt-4">
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
  onReject,
  isPending,
  dimmed,
}: {
  alert: PriceAlert
  onAcknowledge?: () => void
  onApply?: () => void
  onReject?: () => void
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
            <ArrowUpRight className="h-4 w-4 text-red-text" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-green-text" />
          )}
          <Badge variant={severity}>
            {isIncrease ? "+" : ""}
            {alert.priceChangePercent?.toFixed(1)}%
          </Badge>
        </div>

        {!dimmed && onAcknowledge && onApply && (
          <div className="flex gap-1">
            {onReject && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReject}
                disabled={isPending}
                title="Reject — wrong match. Future invoices with this description won't auto-link to this ingredient."
                className="text-red-text hover:bg-red-light hover:text-red-text"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
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

function UnitChangedRow({
  alert,
  isPending,
}: {
  alert: UnitChangedAlert
  isPending: boolean
}) {
  const router = useRouter()
  const [localPending, startLocal] = useTransition()
  const [factor, setFactor] = useState<string>(
    alert.suggestedConversionFactor != null
      ? String(alert.suggestedConversionFactor)
      : ""
  )
  const [error, setError] = useState<string | null>(null)

  const busy = isPending || localPending
  const parsed = parseFloat(factor)
  const valid = Number.isFinite(parsed) && parsed > 0

  function submit() {
    setError(null)
    if (!valid) {
      setError("Enter a positive number")
      return
    }
    startLocal(async () => {
      try {
        await confirmConversion(alert.id, parsed)
        router.refresh()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const impliedStoredPrice = valid ? alert.invoiceUnitPrice * parsed : null

  return (
    <div className="rounded-lg border border-amber-text/20 bg-amber-light/40 p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">{alert.ingredientName}</span>
        <Badge variant="secondary" className="text-[10px]">
          {alert.supplierName}
        </Badge>
        {alert.invoiceNumber && (
          <span className="text-xs text-muted-foreground">#{alert.invoiceNumber}</span>
        )}
      </div>
      <div className="text-xs text-muted-foreground">
        Stored: ${alert.storedUnitPrice.toFixed(2)}/{alert.storedUnit}
        {" · "}
        Invoice: ${alert.invoiceUnitPrice.toFixed(2)}/{alert.invoiceUnit || "?"}
        {" · "}
        <span className="italic">&ldquo;{alert.description}&rdquo;</span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-muted-foreground">
          1 {alert.invoiceUnit || "invoice unit"} =
        </label>
        <input
          type="number"
          step="any"
          min={0}
          value={factor}
          onChange={(e) => setFactor(e.target.value)}
          disabled={busy}
          className="w-24 rounded border border-amber-text/30 bg-card px-2 py-1 text-xs"
          placeholder="e.g. 5"
        />
        <span className="text-xs text-muted-foreground">
          {alert.storedUnit || "stored unit"}
          {valid && impliedStoredPrice !== null && (
            <>
              {" → "}
              <span className="font-medium text-foreground">
                ${impliedStoredPrice.toFixed(2)}/{alert.storedUnit}
              </span>
            </>
          )}
        </span>
        <Button size="sm" onClick={submit} disabled={busy || !valid}>
          {alert.suggestedConversionFactor != null ? "Confirm" : "Save conversion"}
        </Button>
      </div>
      {alert.suggestedConversionFactor != null && (
        <p className="text-[11px] text-amber-text">
          Suggested from description — confirm or adjust before saving.
        </p>
      )}
      {error && <p className="text-[11px] text-red-text">{error}</p>}
    </div>
  )
}
