"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  Send,
  Mail,
  Trash2,
  Save,
  Copy,
  CheckCircle2,
  XCircle,
  ShoppingCart,
  Truck,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { OrderDetail } from "@/lib/actions/orders"
import {
  updateOrderLines,
  submitOrder,
  cancelOrder,
} from "@/lib/actions/orders"

interface LocalLine {
  id?: string
  ingredientId: string
  ingredientName: string
  supplierCode: string | null
  quantity: string
  unit: string
  unitPrice: string
  note: string
  dirty: boolean
  removed?: boolean
}

const STATUS_META: Record<
  string,
  { label: string; variant: "outline" | "amber" | "green" | "red"; icon: typeof ShoppingCart }
> = {
  DRAFT: { label: "Draft", variant: "amber", icon: ShoppingCart },
  SUBMITTED: { label: "Submitted", variant: "outline", icon: Send },
  PARTIALLY_RECEIVED: { label: "Partially received", variant: "outline", icon: Truck },
  RECEIVED: { label: "Received", variant: "green", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", variant: "red", icon: XCircle },
}

export function OrderDetailView({ initial }: { initial: OrderDetail }) {
  const router = useRouter()
  const [lines, setLines] = useState<LocalLine[]>(() =>
    initial.lines.map((l) => ({
      id: l.id,
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
      supplierCode: l.supplierCode,
      quantity: String(l.quantity),
      unit: l.unit,
      unitPrice: String(l.unitPrice),
      note: l.note ?? "",
      dirty: false,
    }))
  )
  const [isPending, startTransition] = useTransition()
  const [copied, setCopied] = useState(false)

  const status = initial.status
  const meta = STATUS_META[status] ?? STATUS_META.DRAFT
  const StatusIcon = meta.icon
  const canEdit = status === "DRAFT"

  const subtotal = lines.reduce((s, l) => {
    if (l.removed) return s
    const q = parseFloat(l.quantity) || 0
    const up = parseFloat(l.unitPrice) || 0
    return s + q * up
  }, 0)

  function updateLine(idx: number, patch: Partial<LocalLine>) {
    setLines((prev) =>
      prev.map((l, i) =>
        i === idx ? { ...l, ...patch, dirty: true } : l
      )
    )
  }

  function removeLine(idx: number) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, removed: true, dirty: true } : l))
    )
  }

  function save() {
    startTransition(async () => {
      const toUpdate = lines
        .filter((l) => !l.removed && l.dirty)
        .map((l) => ({
          id: l.id,
          ingredientId: l.ingredientId,
          quantity: parseFloat(l.quantity) || 0,
          unit: l.unit,
          unitPrice: parseFloat(l.unitPrice) || 0,
          note: l.note || undefined,
        }))
      const removeIds = lines
        .filter((l) => l.removed && l.id)
        .map((l) => l.id as string)
      await updateOrderLines({
        orderId: initial.id,
        lines: toUpdate,
        removeIds,
      })
      router.refresh()
    })
  }

  function submit() {
    startTransition(async () => {
      // Save any pending edits first
      const toUpdate = lines
        .filter((l) => !l.removed && l.dirty)
        .map((l) => ({
          id: l.id,
          ingredientId: l.ingredientId,
          quantity: parseFloat(l.quantity) || 0,
          unit: l.unit,
          unitPrice: parseFloat(l.unitPrice) || 0,
          note: l.note || undefined,
        }))
      const removeIds = lines
        .filter((l) => l.removed && l.id)
        .map((l) => l.id as string)
      if (toUpdate.length > 0 || removeIds.length > 0) {
        await updateOrderLines({
          orderId: initial.id,
          lines: toUpdate,
          removeIds,
        })
      }
      await submitOrder({ orderId: initial.id })
      router.refresh()
    })
  }

  function cancel() {
    if (!confirm("Cancel this order? The draft will be kept but marked cancelled.")) return
    startTransition(async () => {
      await cancelOrder(initial.id)
      router.refresh()
    })
  }

  function copyEmailBody() {
    if (!initial.emailBody) return
    navigator.clipboard.writeText(initial.emailBody)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function openMailto() {
    if (!initial.emailTo || !initial.emailSubject || !initial.emailBody) return
    const params = new URLSearchParams({
      subject: initial.emailSubject,
      body: initial.emailBody,
    })
    window.location.href = `mailto:${initial.emailTo}?${params.toString()}`
  }

  return (
    <div className={cn("space-y-6", isPending && "opacity-80")}>
      <div>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to orders
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {initial.supplierName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant={meta.variant} className="gap-1 text-[10px]">
                <StatusIcon className="h-3 w-3" />
                {meta.label}
              </Badge>
              <Badge variant="outline">
                {VENUE_SHORT_LABEL[initial.venue] ?? initial.venue}
              </Badge>
              <span>
                Ordered{" "}
                {new Date(initial.orderDate).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              {initial.submittedAt && (
                <span>
                  · sent{" "}
                  {new Date(initial.submittedAt).toLocaleDateString("en-AU", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <>
                <button
                  onClick={cancel}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <XCircle className="h-4 w-4" />
                  Cancel order
                </button>
                <button
                  onClick={save}
                  disabled={isPending}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Save className="h-4 w-4" />
                  Save
                </button>
                <button
                  onClick={submit}
                  disabled={isPending || lines.filter((l) => !l.removed).length === 0}
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  Submit
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Subtotal</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${subtotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">ex GST</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Lines</p>
            <p className="mt-1 text-3xl font-bold">
              {lines.filter((l) => !l.removed).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Expected</p>
            <p className="mt-1 text-xl font-semibold">
              {initial.expectedDate
                ? new Date(initial.expectedDate).toLocaleDateString("en-AU", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                  })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Submitted email snapshot */}
      {!canEdit && initial.emailBody && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
                <Mail className="h-4 w-4" />
                Order email
              </CardTitle>
              <div className="flex gap-1.5">
                <button
                  onClick={copyEmailBody}
                  className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Copy className="h-3 w-3" />
                  {copied ? "Copied" : "Copy"}
                </button>
                {initial.emailTo && (
                  <button
                    onClick={openMailto}
                    className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2 py-1 text-xs font-medium text-white hover:bg-gray-800"
                  >
                    <Mail className="h-3 w-3" />
                    Open in mail
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
              <div className="mb-2 grid grid-cols-[80px_1fr] gap-y-1">
                <span className="text-muted-foreground">To</span>
                <span>{initial.emailTo ?? "—"}</span>
                <span className="text-muted-foreground">Subject</span>
                <span>{initial.emailSubject}</span>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {initial.emailBody}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pl-6">Ingredient</th>
                  <th className="py-2 w-24">Qty</th>
                  <th className="py-2 w-20">Unit</th>
                  <th className="py-2 w-28">Unit $</th>
                  <th className="py-2">Note</th>
                  <th className="py-2 w-24 text-right">Line $</th>
                  <th className="py-2 w-10 pr-6"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  if (l.removed) return null
                  const q = parseFloat(l.quantity) || 0
                  const up = parseFloat(l.unitPrice) || 0
                  const lt = q * up
                  return (
                    <tr
                      key={l.id ?? `new-${idx}`}
                      className="border-b border-border/50 last:border-0"
                    >
                      <td className="py-2 pl-6">
                        <div className="font-medium">{l.ingredientName}</div>
                        {l.supplierCode && (
                          <div className="text-[10px] text-muted-foreground">
                            [{l.supplierCode}]
                          </div>
                        )}
                      </td>
                      <td className="py-2">
                        {canEdit ? (
                          <input
                            inputMode="decimal"
                            value={l.quantity}
                            onChange={(e) =>
                              updateLine(idx, { quantity: e.target.value })
                            }
                            className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                          />
                        ) : (
                          <span className="tabular-nums">{l.quantity}</span>
                        )}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {l.unit}
                      </td>
                      <td className="py-2">
                        {canEdit ? (
                          <input
                            inputMode="decimal"
                            value={l.unitPrice}
                            onChange={(e) =>
                              updateLine(idx, { unitPrice: e.target.value })
                            }
                            className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                          />
                        ) : (
                          <span className="tabular-nums">${l.unitPrice}</span>
                        )}
                      </td>
                      <td className="py-2">
                        {canEdit ? (
                          <input
                            value={l.note}
                            onChange={(e) =>
                              updateLine(idx, { note: e.target.value })
                            }
                            placeholder="Optional"
                            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {l.note || "—"}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        ${lt.toFixed(2)}
                      </td>
                      <td className="py-2 pr-6">
                        {canEdit && (
                          <button
                            onClick={() => removeLine(idx)}
                            className="rounded-md p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td colSpan={5} className="py-2 pl-6 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Subtotal
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold">
                    ${subtotal.toFixed(2)}
                  </td>
                  <td className="pr-6"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
