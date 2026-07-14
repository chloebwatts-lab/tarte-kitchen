"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  CheckCircle2,
  Circle,
  Send,
  Loader2,
  Mail,
  Truck,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { upsertOrderLine } from "@/lib/actions/order-checklist"
import { submitOrder } from "@/lib/actions/orders"
import type { SupplierOrderRow } from "@/lib/actions/order-checklist"
import type { Venue } from "@/generated/prisma"
import { VENUE_LABEL } from "@/lib/venues"

type SupplierMeta = {
  id: string
  name: string
  email: string | null
  deliveryDays: number[]
}
type OrderMeta = {
  id: string
  status: string
  venue: Venue
  subtotal: number
  submittedAt: string | null
}

export function OrderRunView({
  supplier,
  venue,
  order,
  rows,
}: {
  supplier: SupplierMeta
  venue: Venue
  order: OrderMeta
  rows: SupplierOrderRow[]
}) {
  const router = useRouter()
  const [saving, startSave] = useTransition()
  const [submitting, startSubmit] = useTransition()
  const [filter, setFilter] = useState("")
  const sent = order.status === "SUBMITTED"

  // Local optimistic state so the UI feels snappy while saves go out
  const [qtyByItem, setQtyByItem] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {}
    for (const r of rows) {
      if (r.draftLine && r.draftLine.quantity > 0) m[r.approvedItemId] = r.draftLine.quantity
    }
    return m
  })

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.category ?? "").toLowerCase().includes(q)
    )
  }, [rows, filter])

  const byCategory = useMemo(() => {
    const m = new Map<string, SupplierOrderRow[]>()
    for (const r of filtered) {
      const k = r.category || "Uncategorised"
      const list = m.get(k) ?? []
      list.push(r)
      m.set(k, list)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const itemsSelected = Object.entries(qtyByItem).filter(([, q]) => q > 0).length
  const total = useMemo(() => {
    let t = 0
    for (const r of rows) {
      const q = qtyByItem[r.approvedItemId] ?? 0
      if (q > 0) t += q * r.packPrice
    }
    return t
  }, [rows, qtyByItem])

  function changeQty(approvedItemId: string, qty: number) {
    if (sent) return
    setQtyByItem((p) => ({ ...p, [approvedItemId]: Math.max(0, qty) }))
    startSave(async () => {
      await upsertOrderLine({
        orderId: order.id,
        approvedItemId,
        quantity: Math.max(0, qty),
      })
    })
  }

  function incPack(approvedItemId: string, step = 1) {
    const cur = qtyByItem[approvedItemId] ?? 0
    changeQty(approvedItemId, cur + step)
  }
  function decPack(approvedItemId: string) {
    const cur = qtyByItem[approvedItemId] ?? 0
    changeQty(approvedItemId, Math.max(0, cur - 1))
  }
  function toggleTick(approvedItemId: string) {
    const cur = qtyByItem[approvedItemId] ?? 0
    changeQty(approvedItemId, cur > 0 ? 0 : 1)
  }

  function onSubmit() {
    if (itemsSelected === 0 || sent) return
    startSubmit(async () => {
      // Send email + flip status — existing submitOrder action handles both
      await submitOrder({ orderId: order.id })
      router.refresh()
    })
  }

  const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <div className="space-y-3 pb-32">
      {/* Sticky header summary */}
      <div className="sticky top-0 z-10 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border sm:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{VENUE_LABEL[venue]}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Truck className="h-3 w-3" />
              {supplier.deliveryDays.length === 0
                ? "no delivery days"
                : DAY_LETTERS.map((letter, idx) => {
                    const dayNum = idx === 0 ? 7 : idx
                    const active = supplier.deliveryDays.includes(dayNum)
                    return (
                      <span
                        key={idx}
                        className={
                          "inline-flex h-4 w-4 items-center justify-center rounded text-[9px] " +
                          (active
                            ? "bg-foreground text-background"
                            : "border border-muted text-muted-foreground/70")
                        }
                      >
                        {letter}
                      </span>
                    )
                  })}
            </span>
            {supplier.email && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Mail className="h-3 w-3" />
                {supplier.email}
              </span>
            )}
            {saving && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> saving…
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right text-sm tabular-nums">
              <div className="font-semibold">${total.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">
                {itemsSelected} item{itemsSelected === 1 ? "" : "s"}
              </div>
            </div>
            {sent ? (
              <Badge variant="green" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Sent
              </Badge>
            ) : (
              <Button
                onClick={onSubmit}
                disabled={itemsSelected === 0 || submitting}
                className="gap-1"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {submitting ? "Sending…" : `Send order`}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filter */}
      <Input
        placeholder="Filter items…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-md"
      />

      {/* Items by category */}
      {byCategory.map(([cat, items]) => (
        <Card key={cat}>
          <CardContent className="p-0">
            <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">
              {cat}{" "}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            </div>
            <ul className="divide-y">
              {items.map((r) => {
                const qty = qtyByItem[r.approvedItemId] ?? 0
                const checked = qty > 0
                return (
                  <li
                    key={r.approvedItemId}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 hover:bg-muted/30",
                      checked && "bg-sage-soft/40 dark:bg-blue-900/10"
                    )}
                  >
                    {/* Tick */}
                    <button
                      type="button"
                      onClick={() => toggleTick(r.approvedItemId)}
                      disabled={sent}
                      className="shrink-0 disabled:opacity-50"
                      aria-label={checked ? "Untick" : "Tick"}
                    >
                      {checked ? (
                        <CheckCircle2 className="h-7 w-7 text-sage-deep" />
                      ) : (
                        <Circle className="h-7 w-7 text-muted-foreground/60" />
                      )}
                    </button>

                    {/* Item */}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium leading-tight">{r.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {r.packSize && <span>{r.packSize}</span>}
                        <span>· ${r.packPrice.toFixed(2)}/pack</span>
                        {!r.ingredientId && (
                          <Badge variant="outline" className="text-[9px]">no ingredient link</Badge>
                        )}
                      </div>
                    </div>

                    {/* Qty stepper */}
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => decPack(r.approvedItemId)}
                        disabled={sent || qty === 0}
                        className="h-9 w-9 rounded-md border bg-card text-lg leading-none disabled:opacity-40"
                      >
                        −
                      </button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={qty === 0 ? "" : qty}
                        onChange={(e) =>
                          changeQty(r.approvedItemId, Number(e.target.value) || 0)
                        }
                        disabled={sent}
                        placeholder="0"
                        className="h-9 w-14 text-center tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => incPack(r.approvedItemId)}
                        disabled={sent}
                        className="h-9 w-9 rounded-md border bg-card text-lg leading-none disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ))}

      {/* Sticky send bar (mobile) */}
      {!sent && (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t bg-background/95 px-4 py-3 backdrop-blur sm:hidden">
          <Button
            onClick={onSubmit}
            disabled={itemsSelected === 0 || submitting}
            className="h-12 w-full gap-1 text-base"
          >
            {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {submitting ? "Sending…" : `Send order · ${itemsSelected} item${itemsSelected === 1 ? "" : "s"} · $${total.toFixed(2)}`}
          </Button>
        </div>
      )}
    </div>
  )
}
