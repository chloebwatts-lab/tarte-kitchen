"use client"

import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  bulkUpsertPars,
  refreshAutoParsFromInvoices,
  type ParSuggestionRow,
} from "@/lib/actions/par-levels"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"
import { cn } from "@/lib/utils"

type EditState = Record<string, Record<string, string>> // ingredientId -> venue -> string

export function ParLevelsView({ rows }: { rows: ParSuggestionRow[] }) {
  const router = useRouter()
  const [edits, setEdits] = useState<EditState>({})
  const [filter, setFilter] = useState("")
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(false)
  const [saving, startSave] = useTransition()
  const [refreshing, startRefresh] = useTransition()
  const [refreshSummary, setRefreshSummary] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return rows.filter((r) => {
      if (q && !r.ingredientName.toLowerCase().includes(q) && !(r.supplierName ?? "").toLowerCase().includes(q)) {
        return false
      }
      if (showOnlyDiffs) {
        const anyDiff = SINGLE_VENUES.some((v) => {
          const cur = r.currentPar[v] ?? 0
          const sug = r.suggestedPar[v]
          return sug !== cur && (sug > 0 || cur > 0)
        })
        if (!anyDiff) return false
      }
      return true
    })
  }, [rows, filter, showOnlyDiffs])

  const byCategory = useMemo(() => {
    const m = new Map<string, ParSuggestionRow[]>()
    for (const r of filtered) {
      const list = m.get(r.category) ?? []
      list.push(r)
      m.set(r.category, list)
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]))
  }, [filtered])

  // Effective value for an ingredient+venue: edited if set, else current, else suggested.
  function effectiveValue(ingId: string, venue: Venue, row: ParSuggestionRow): string {
    const edit = edits[ingId]?.[venue]
    if (edit !== undefined) return edit
    const cur = row.currentPar[venue]
    if (cur != null) return String(cur)
    return String(row.suggestedPar[venue] ?? 0)
  }

  function setEdit(ingId: string, venue: Venue, value: string) {
    setEdits((prev) => ({
      ...prev,
      [ingId]: { ...(prev[ingId] ?? {}), [venue]: value },
    }))
  }

  function acceptSuggestion(ingId: string, venue: Venue, suggested: number) {
    setEdit(ingId, venue, String(suggested))
  }

  function acceptAllSuggestions(venue?: Venue) {
    setEdits((prev) => {
      const next = { ...prev }
      for (const r of filtered) {
        const venues = venue ? [venue] : (SINGLE_VENUES as readonly Venue[])
        for (const v of venues) {
          const sug = r.suggestedPar[v]
          if (sug > 0) {
            next[r.ingredientId] = { ...(next[r.ingredientId] ?? {}), [v]: String(sug) }
          }
        }
      }
      return next
    })
  }

  function dirtyCount(): number {
    let n = 0
    for (const [ingId, perVenue] of Object.entries(edits)) {
      const row = rows.find((r) => r.ingredientId === ingId)
      if (!row) continue
      for (const [v, val] of Object.entries(perVenue)) {
        const cur = row.currentPar[v as Venue] ?? null
        const parsed = Number(val)
        if (!Number.isFinite(parsed)) continue
        if (cur === null || parsed !== cur) n++
      }
    }
    return n
  }

  function save() {
    const items: Parameters<typeof bulkUpsertPars>[0] = []
    for (const [ingId, perVenue] of Object.entries(edits)) {
      const row = rows.find((r) => r.ingredientId === ingId)
      if (!row) continue
      for (const [v, val] of Object.entries(perVenue)) {
        const parsed = Number(val)
        if (!Number.isFinite(parsed) || parsed < 0) continue
        const cur = row.currentPar[v as Venue] ?? null
        if (cur !== null && parsed === cur) continue // no change
        items.push({
          ingredientId: ingId,
          venue: v as Venue,
          parLevel: parsed,
          parUnit: row.packUnit,
        })
      }
    }
    if (items.length === 0) return
    startSave(async () => {
      await bulkUpsertPars(items)
      setEdits({})
      router.refresh()
    })
  }

  const dirty = dirtyCount()

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Input
            placeholder="Filter by ingredient or supplier…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showOnlyDiffs}
              onChange={(e) => setShowOnlyDiffs(e.target.checked)}
            />
            Only show ingredients where suggested ≠ current
          </label>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={refreshing}
              onClick={() => {
                startRefresh(async () => {
                  const r = await refreshAutoParsFromInvoices()
                  setRefreshSummary(
                    `Updated ${r.parsUpserted} pars across ${r.ingredientsProcessed} ingredients (skipped ${r.skippedManual} chef-set)`
                  )
                  router.refresh()
                })
              }}
            >
              {refreshing ? "Computing…" : "Auto-par from invoices"}
            </Button>
            {SINGLE_VENUES.map((v) => (
              <Button
                key={v}
                variant="outline"
                size="sm"
                onClick={() => acceptAllSuggestions(v)}
              >
                Accept all → {VENUE_SHORT_LABEL[v]}
              </Button>
            ))}
            <Button onClick={save} disabled={dirty === 0 || saving}>
              {saving ? "Saving…" : `Save ${dirty} change${dirty === 1 ? "" : "s"}`}
            </Button>
          </div>
        </CardContent>
        {refreshSummary && (
          <div className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
            {refreshSummary}
          </div>
        )}
      </Card>

      {byCategory.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No ingredients match.
          </CardContent>
        </Card>
      )}

      {byCategory.map(([category, items]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {category || "Uncategorised"}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({items.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Ingredient</th>
                    <th className="px-2 py-2 font-medium">Supplier</th>
                    <th className="px-2 py-2 font-medium">Pack</th>
                    {SINGLE_VENUES.map((v) => (
                      <th key={v} className="px-2 py-2 font-medium" colSpan={3}>
                        {VENUE_SHORT_LABEL[v]}
                      </th>
                    ))}
                  </tr>
                  <tr className="border-b text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th />
                    <th />
                    <th />
                    {SINGLE_VENUES.map((v) => (
                      <>
                        <th key={`${v}-u`} className="px-2 py-1 font-normal">
                          Wk usage
                        </th>
                        <th key={`${v}-s`} className="px-2 py-1 font-normal">
                          Suggested
                        </th>
                        <th key={`${v}-c`} className="px-2 py-1 font-normal">
                          Par
                        </th>
                      </>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.ingredientId} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-3 py-2 align-middle font-medium">
                        {r.ingredientName}
                      </td>
                      <td className="px-2 py-2 align-middle text-xs text-muted-foreground">
                        {r.supplierName ?? "—"}
                      </td>
                      <td className="px-2 py-2 align-middle text-xs text-muted-foreground">
                        {r.packQuantity} {r.packUnit}
                      </td>
                      {SINGLE_VENUES.map((v) => {
                        const usage = r.weeklyUsage[v]
                        const sug = r.suggestedPar[v]
                        const cur = r.currentPar[v]
                        const value = effectiveValue(r.ingredientId, v, r)
                        const sourceTag = r.currentParSource[v]
                        const isDirty = edits[r.ingredientId]?.[v] !== undefined
                        return (
                          <>
                            <td key={`${v}-u`} className="px-2 py-2 text-right text-xs tabular-nums text-muted-foreground">
                              {usage > 0 ? usage : "—"}
                            </td>
                            <td key={`${v}-s`} className="px-2 py-2 text-right text-xs tabular-nums">
                              {sug > 0 ? (
                                <button
                                  className="rounded bg-blue-50 px-2 py-0.5 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                                  onClick={() => acceptSuggestion(r.ingredientId, v, sug)}
                                  title="Click to use this suggestion"
                                >
                                  {sug}
                                </button>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td key={`${v}-c`} className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.1"
                                  min="0"
                                  value={value}
                                  onChange={(e) =>
                                    setEdit(r.ingredientId, v, e.target.value)
                                  }
                                  className={cn(
                                    "h-7 w-20 text-right text-xs tabular-nums",
                                    isDirty && "border-blue-500"
                                  )}
                                />
                                {cur != null && sourceTag === "LEGACY" && (
                                  <Badge variant="outline" className="text-[9px]">legacy</Badge>
                                )}
                                {cur != null && sourceTag === "MANUAL" && (
                                  <Badge variant="outline" className="text-[9px]">manual</Badge>
                                )}
                                {cur != null && sourceTag === "AUTO_INVOICE" && (
                                  <Badge variant="outline" className="text-[9px]">auto</Badge>
                                )}
                              </div>
                            </td>
                          </>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
