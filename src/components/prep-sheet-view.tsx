"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ChevronDown, ChevronRight, Printer, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { PrepSheet } from "@/lib/actions/prep-sheet"
import { getPrepSheet } from "@/lib/actions/prep-sheet"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL } from "@/lib/venues"

type VenueFilter = Venue | "ALL"

function nextDayIso() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split("T")[0]
}

export function PrepSheetView({ initial }: { initial: PrepSheet }) {
  const [sheet, setSheet] = useState<PrepSheet>(initial)
  const [venue, setVenue] = useState<VenueFilter>(initial.venue)
  const [date, setDate] = useState<string>(initial.forDate || nextDayIso())
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [isPending, startTransition] = useTransition()

  function refresh(nextVenue: VenueFilter, nextDate: string) {
    setVenue(nextVenue)
    setDate(nextDate)
    startTransition(async () => {
      const next = await getPrepSheet({ venue: nextVenue, forDate: nextDate })
      setSheet(next)
    })
  }

  const byCategory = useMemo(() => {
    const m = new Map<string, PrepSheet["lines"]>()
    for (const l of sheet.lines) {
      const arr = m.get(l.category) ?? []
      arr.push(l)
      m.set(l.category, arr)
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [sheet.lines])

  const humanDate = new Date(sheet.forDate).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  })

  return (
    <div className={cn("space-y-6", isPending && "opacity-70")}>
      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3">
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
                onClick={() => refresh(value, date)}
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
          <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-1">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={date}
              onChange={(e) => refresh(venue, e.target.value)}
              className="border-0 bg-transparent text-xs font-medium outline-none"
            />
          </div>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 print:hidden"
        >
          <Printer className="h-3.5 w-3.5" />
          Print
        </button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Prepping for</p>
            <p className="mt-1 text-xl font-semibold">{humanDate}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Preparations</p>
            <p className="mt-1 text-3xl font-bold">{sheet.lines.length}</p>
            <p className="text-xs text-muted-foreground">
              {sheet.lines.reduce((s, l) => s + l.batchesNeeded, 0)} batches total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Forecast cost</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${sheet.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              Batches × batch cost
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Print header — only visible on print */}
      <div className="hidden print:block">
        <h1 className="text-2xl font-bold">Prep Sheet — {humanDate}</h1>
        <p className="text-sm">
          {venue === "ALL" ? "All venues" : VENUE_SHORT_LABEL[venue as Venue]}
        </p>
      </div>

      {/* Prep list by category */}
      {sheet.lines.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nothing to prep. Either we have no sales data for this weekday at
            this venue, or no dishes use preparations.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {byCategory.map(([category, lines]) => (
            <Card key={category}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  {category.replace(/_/g, " ")} · {lines.length}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {lines.map((l) => {
                  const isOpen = expanded[l.preparationId]
                  return (
                    <div
                      key={l.preparationId}
                      className="rounded-md border border-border"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpanded((s) => ({
                            ...s,
                            [l.preparationId]: !s[l.preparationId],
                          }))
                        }
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-muted/40 print:bg-transparent"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground print:hidden" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground print:hidden" />
                        )}
                        <div className="flex w-10 shrink-0 items-center justify-center rounded-md bg-gray-900 px-2 py-1 text-sm font-bold text-white tabular-nums print:bg-gray-200 print:text-gray-900">
                          {l.batchesNeeded}×
                        </div>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/preparations/${l.preparationId}/print`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium hover:underline"
                          >
                            {l.preparationName}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            Yield: {l.yieldPerBatch} {l.yieldUnit} per batch ·
                            Need {Math.round(l.requiredBaseQty).toLocaleString()}{" "}
                            {l.baseUnit}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-medium tabular-nums">
                            ${l.totalCost.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-muted-foreground">
                            @ ${l.batchCost.toFixed(2)}/batch
                          </div>
                        </div>
                      </button>
                      {isOpen && l.drivers.length > 0 && (
                        <div className="border-t border-border bg-muted/30 px-3 py-2 text-xs">
                          <div className="mb-1 font-medium text-muted-foreground">
                            Driven by forecast:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {dedupeDrivers(l.drivers).map((d, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[11px]"
                              >
                                <span className="tabular-nums">{d.forecastQty}×</span>
                                <span>{d.dishName}</span>
                                <span className="text-muted-foreground">
                                  ({VENUE_SHORT_LABEL[d.venue as Venue] ?? d.venue})
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Unmatched forecast items */}
      {sheet.unmatchedForecast.length > 0 && (
        <Card className="print:hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Unmatched POS items <Badge variant="amber" className="ml-1 text-[10px]">{sheet.unmatchedForecast.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-xs text-muted-foreground">
              These items sold but aren&apos;t linked to a dish in Menu Items,
              so they can&apos;t drive prep. Map them to unlock forecasting.
            </p>
            <div className="space-y-1 text-xs">
              {sheet.unmatchedForecast.map((u, i) => (
                <div key={i} className="flex justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1">
                  <span>{u.menuItemName}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {u.forecastQty} × {VENUE_SHORT_LABEL[u.venue as Venue] ?? u.venue}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function dedupeDrivers(ds: PrepSheet["lines"][number]["drivers"]) {
  const m = new Map<string, PrepSheet["lines"][number]["drivers"][number]>()
  for (const d of ds) {
    const key = `${d.venue}|${d.dishName}`
    const existing = m.get(key)
    if (existing) existing.forecastQty += d.forecastQty
    else m.set(key, { ...d })
  }
  return Array.from(m.values()).sort((a, b) => b.forecastQty - a.forecastQty)
}
