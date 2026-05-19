"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { createDraftOrder } from "@/lib/actions/orders"
import type { SupplierOrderLine } from "@/lib/actions/supplier-order"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"
import { cn } from "@/lib/utils"

type LineState = {
  selected: boolean
  packs: string // string for input control
}

export function SupplierOrderForm({
  supplier,
  initialVenue,
  lines,
}: {
  supplier: { id: string; name: string; email: string | null }
  initialVenue: Venue
  lines: SupplierOrderLine[]
}) {
  const router = useRouter()
  const [venue, setVenue] = useState<Venue>(initialVenue)
  const [filter, setFilter] = useState("")
  const [submitting, startSubmit] = useTransition()

  // Initial state: any item with a suggested qty > 0 starts ticked at that qty
  const [rows, setRows] = useState<Record<string, LineState>>(() => {
    const m: Record<string, LineState> = {}
    for (const l of lines) {
      m[l.approvedItemId] = {
        selected: l.suggestedPacks > 0,
        packs: l.suggestedPacks > 0 ? String(l.suggestedPacks) : "",
      }
    }
    return m
  })

  function setLine(id: string, patch: Partial<LineState>) {
    setRows((p) => ({ ...p, [id]: { ...p[id], ...patch } }))
  }

  function changeVenue(next: Venue) {
    setVenue(next)
    // Reload with venue in URL so getSupplierOrderForm re-runs with new par + invoice data
    router.push(`/orders/new/${supplier.id}?venue=${next}`)
  }

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return lines
    return lines.filter((l) => l.name.toLowerCase().includes(q) || (l.category ?? "").toLowerCase().includes(q))
  }, [lines, filter])

  const byCategory = useMemo(() => {
    const m = new Map<string, SupplierOrderLine[]>()
    for (const l of filtered) {
      const k = l.category || "Uncategorised"
      const list = m.get(k) ?? []
      list.push(l)
      m.set(k, list)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  const selectedRows = useMemo(() => {
    return lines.filter((l) => {
      const s = rows[l.approvedItemId]
      if (!s?.selected) return false
      const n = Number(s.packs)
      return Number.isFinite(n) && n > 0
    })
  }, [lines, rows])

  const totalItems = selectedRows.length
  const totalDollars = useMemo(() => {
    return selectedRows.reduce((sum, l) => {
      const packs = Number(rows[l.approvedItemId]?.packs) || 0
      return sum + packs * l.packPrice
    }, 0)
  }, [selectedRows, rows])

  function submit() {
    if (selectedRows.length === 0) return
    startSubmit(async () => {
      const payload = {
        supplierId: supplier.id,
        venue,
        lines: selectedRows.map((l) => {
          const packs = Number(rows[l.approvedItemId].packs)
          return {
            ingredientId: l.ingredientId,
            description: `${l.name}${l.packSize ? ` (${l.packSize})` : ""}`,
            quantity: packs,
            unit: "pack",
            unitPrice: l.packPrice,
          }
        }),
      }
      const orderId = await createDraftOrder(payload)
      router.push(`/orders/${orderId}`)
    })
  }

  return (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Input
            placeholder="Filter items…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">Venue</span>
            <div className="flex overflow-hidden rounded border">
              {SINGLE_VENUES.map((v) => (
                <button
                  key={v}
                  className={cn(
                    "px-3 py-1 text-xs",
                    v === venue ? "bg-foreground text-background" : "bg-card hover:bg-muted"
                  )}
                  onClick={() => changeVenue(v)}
                >
                  {VENUE_SHORT_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">
              {totalItems} item{totalItems === 1 ? "" : "s"} · ${totalDollars.toFixed(2)}
            </span>
            <Button onClick={submit} disabled={totalItems === 0 || submitting}>
              {submitting ? "Creating draft…" : "Create draft order"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {byCategory.map(([cat, items]) => (
        <Card key={cat}>
          <CardContent className="p-0">
            <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium">
              {cat}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            </div>
            <table className="w-full text-sm">
              <tbody>
                {items.map((l) => {
                  const state = rows[l.approvedItemId]
                  const packsNum = Number(state?.packs ?? 0) || 0
                  const lineTotal = packsNum * l.packPrice
                  return (
                    <tr
                      key={l.approvedItemId}
                      className={cn(
                        "border-b last:border-0 hover:bg-muted/20",
                        state?.selected && "bg-blue-50/40 dark:bg-blue-900/10"
                      )}
                    >
                      <td className="w-8 pl-3">
                        <input
                          type="checkbox"
                          checked={state?.selected ?? false}
                          onChange={(e) =>
                            setLine(l.approvedItemId, { selected: e.target.checked })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium">{l.name}</div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {l.packSize && <span>{l.packSize}</span>}
                          {!l.ingredientId && (
                            <Badge variant="outline" className="text-[9px]">no ingredient link</Badge>
                          )}
                          {l.suggestionSource === "PAR" && (
                            <Badge variant="outline" className="text-[9px]">par</Badge>
                          )}
                          {l.suggestionSource === "LAST_INVOICE" && l.lastInvoiceDate && (
                            <Badge variant="outline" className="text-[9px]">
                              last bought {l.lastInvoiceDate}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                        ${l.packPrice.toFixed(2)}/pack
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={state?.packs ?? ""}
                          onChange={(e) =>
                            setLine(l.approvedItemId, {
                              packs: e.target.value,
                              selected: Number(e.target.value) > 0,
                            })
                          }
                          className="h-7 w-16 text-right text-xs tabular-nums"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 text-right text-xs tabular-nums">
                        {state?.selected && packsNum > 0
                          ? `$${lineTotal.toFixed(2)}`
                          : "—"}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
