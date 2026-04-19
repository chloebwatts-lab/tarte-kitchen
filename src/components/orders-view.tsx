"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import {
  Sparkles,
  ShoppingCart,
  CheckCircle2,
  XCircle,
  Truck,
  Clock,
  ChevronRight,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { OrderListRow, OrderSuggestion } from "@/lib/actions/orders"
import { createDraftOrder, suggestOrders } from "@/lib/actions/orders"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"

type VenueFilter = Venue | "ALL"

export function OrdersView({
  orders,
  suggestions,
}: {
  orders: OrderListRow[]
  suggestions: OrderSuggestion[]
}) {
  const router = useRouter()
  const [venue, setVenue] = useState<VenueFilter>("ALL")
  const [sugg, setSugg] = useState<OrderSuggestion[]>(suggestions)
  const [isPending, startTransition] = useTransition()
  const [creating, setCreating] = useState<string | null>(null)

  function refreshSuggestions(nextVenue: VenueFilter) {
    setVenue(nextVenue)
    startTransition(async () => {
      const next = await suggestOrders({ venue: nextVenue })
      setSugg(next)
    })
  }

  const grouped = useMemo(() => {
    const drafts = orders.filter((o) => o.status === "DRAFT")
    const submitted = orders.filter((o) => o.status === "SUBMITTED")
    const received = orders.filter(
      (o) => o.status === "RECEIVED" || o.status === "PARTIALLY_RECEIVED"
    )
    const cancelled = orders.filter((o) => o.status === "CANCELLED")
    return { drafts, submitted, received, cancelled }
  }, [orders])

  function startDraft(s: OrderSuggestion) {
    const key = `${s.supplierId}|${s.venue}`
    setCreating(key)
    startTransition(async () => {
      try {
        const id = await createDraftOrder({
          supplierId: s.supplierId,
          venue: s.venue,
          lines: s.lines.map((l) => ({
            ingredientId: l.ingredientId,
            quantity: l.suggestedQty,
            unit: l.unit,
            unitPrice: l.unitPrice,
          })),
        })
        router.push(`/orders/${id}`)
      } finally {
        setCreating(null)
      }
    })
  }

  return (
    <div className={cn("space-y-6", isPending && "opacity-80")}>
      {/* Venue filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { label: "All Venues", value: "ALL" as VenueFilter },
              ...SINGLE_VENUES.map((v) => ({
                label: VENUE_SHORT_LABEL[v],
                value: v as VenueFilter,
              })),
            ]
          ).map(({ label, value }) => (
            <button
              key={String(value)}
              onClick={() => refreshSuggestions(value)}
              disabled={isPending}
              className={cn(
                "rounded-full px-4 py-1.5 text-xs font-medium transition-all",
                venue === value
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          onClick={() => refreshSuggestions(venue)}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", isPending && "animate-spin")}
          />
          Refresh suggestions
        </button>
      </div>

      {/* Suggestions */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Suggested orders
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              {sugg.length} supplier{sugg.length === 1 ? "" : "s"} ·{" "}
              $
              {sugg
                .reduce((s, g) => s + g.total, 0)
                .toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {sugg.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing to order. Either par levels are all met, or no
              ingredients have a supplier + par level set yet.
            </p>
          ) : (
            <div className="space-y-2">
              {sugg.map((s) => {
                const key = `${s.supplierId}|${s.venue}`
                const busy = creating === key
                return (
                  <div
                    key={key}
                    className="rounded-md border border-border p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{s.supplierName}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {VENUE_SHORT_LABEL[s.venue]}
                          </Badge>
                          {s.supplierEmail && (
                            <span className="text-[10px] text-muted-foreground">
                              {s.supplierEmail}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {s.lines.length} line{s.lines.length === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xl font-bold tabular-nums">
                            ${s.total.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            ex GST
                          </div>
                        </div>
                        <button
                          onClick={() => startDraft(s)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
                        >
                          {busy ? "Drafting…" : "Create draft"}
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                        Show {s.lines.length} lines
                      </summary>
                      <div className="mt-2 space-y-1">
                        {s.lines.map((l) => (
                          <div
                            key={l.ingredientId}
                            className="flex items-center justify-between gap-2 border-t border-border py-1.5 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="font-medium">
                                {l.ingredientName}
                                {l.supplierCode && (
                                  <span className="ml-1 text-[10px] text-muted-foreground">
                                    [{l.supplierCode}]
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-muted-foreground">
                                {l.reason}
                              </div>
                            </div>
                            <div className="shrink-0 tabular-nums">
                              {l.suggestedQty} {l.unit}
                            </div>
                            <div className="w-20 shrink-0 text-right tabular-nums">
                              ${l.lineTotal.toFixed(2)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Existing orders */}
      <div className="grid gap-4 lg:grid-cols-2">
        <OrderBucket
          title="Drafts"
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          rows={grouped.drafts}
        />
        <OrderBucket
          title="Submitted"
          icon={<ShoppingCart className="h-4 w-4 text-blue-500" />}
          rows={grouped.submitted}
        />
        <OrderBucket
          title="Received"
          icon={<Truck className="h-4 w-4 text-emerald-500" />}
          rows={grouped.received}
        />
        <OrderBucket
          title="Cancelled"
          icon={<XCircle className="h-4 w-4 text-gray-400" />}
          rows={grouped.cancelled}
          muted
        />
      </div>
    </div>
  )
}

function OrderBucket({
  title,
  icon,
  rows,
  muted,
}: {
  title: string
  icon: React.ReactNode
  rows: OrderListRow[]
  muted?: boolean
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {title}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({rows.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted-foreground">
            Nothing here.
          </p>
        ) : (
          <div className={cn("space-y-1", muted && "opacity-60")}>
            {rows.slice(0, 8).map((o) => (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="flex items-center gap-3 rounded-md border border-border p-2 hover:bg-muted/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {o.supplierName}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {VENUE_SHORT_LABEL[o.venue]} ·{" "}
                    {new Date(o.orderDate).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })}{" "}
                    · {o.lineCount} line{o.lineCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="shrink-0 text-right tabular-nums">
                  <div className="text-sm font-medium">
                    ${o.subtotal.toFixed(0)}
                  </div>
                </div>
                <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              </Link>
            ))}
            {rows.length > 8 && (
              <p className="pt-1 text-center text-[10px] text-muted-foreground">
                + {rows.length - 8} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
