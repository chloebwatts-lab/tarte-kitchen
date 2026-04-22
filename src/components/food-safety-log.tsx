"use client"

import { useState, useMemo, useTransition } from "react"
import { ShieldCheck, Mail, ChevronDown, ChevronRight, CheckCircle2, XCircle, Minus } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { getFoodSafetyLog, type FoodSafetyRun } from "@/lib/actions/checklists"
import { VENUE_LABEL } from "@/lib/venues"

interface Props {
  runs: FoodSafetyRun[]
}

const VENUE_OPTIONS = [
  { value: "ALL", label: "All venues" },
  { value: "BURLEIGH", label: "Bakery (Burleigh)" },
  { value: "BEACH_HOUSE", label: "Beach House" },
  { value: "TEA_GARDEN", label: "Tea Garden" },
]

function tempBadge(passed: boolean | null, temp: number | null, hotCheck: boolean) {
  const threshold = hotCheck ? "≥60°C" : "≤5°C"
  if (passed === null) {
    return temp !== null
      ? <span className="text-sm text-gray-500">{temp}°C <span className="text-xs text-gray-400">({threshold})</span></span>
      : <Minus className="h-4 w-4 text-gray-300" />
  }
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> {temp}°C
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-red-600">
      <XCircle className="h-3.5 w-3.5" /> {temp}°C <span className="text-xs">({threshold})</span>
    </span>
  )
}

export function FoodSafetyLog({ runs: initialRuns }: Props) {
  const [isPending, startTransition] = useTransition()
  const [runs, setRuns] = useState(initialRuns)
  const [venue, setVenue] = useState("ALL")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function applyFilters() {
    startTransition(async () => {
      const fresh = await getFoodSafetyLog({
        venue: venue !== "ALL" ? venue as "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN" : undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      setRuns(fresh)
    })
  }

  const failCount = useMemo(
    () => runs.reduce((n, r) => n + r.items.filter((i) => i.passed === false).length, 0),
    [runs]
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <h1 className="text-2xl font-semibold tracking-tight">Food Safety Log</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            HACCP temperature records. Completed checks are emailed automatically to accounts@tarte.com.au.
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-md border border-gray-100 bg-gray-50 px-3 py-1.5 text-sm text-gray-500">
          <Mail className="h-4 w-4" />
          Auto-email on completion
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={venue} onValueChange={setVenue}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VENUE_OPTIONS.map((v) => (
              <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-40"
          placeholder="From"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-40"
          placeholder="To"
        />
        <button
          onClick={applyFilters}
          disabled={isPending}
          className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Loading…" : "Filter"}
        </button>
      </div>

      {/* Summary strip */}
      {runs.length > 0 && (
        <div className="flex gap-4 text-sm">
          <span className="text-muted-foreground">{runs.length} run{runs.length !== 1 ? "s" : ""}</span>
          {failCount > 0 ? (
            <span className="font-medium text-red-600">{failCount} temperature breach{failCount !== 1 ? "es" : ""}</span>
          ) : (
            <span className="font-medium text-emerald-600">No temperature breaches</span>
          )}
        </div>
      )}

      {/* Runs */}
      {runs.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No food safety records found for this period.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => {
            const hasBreaches = run.items.some((i) => i.passed === false)
            const isExpanded = expandedId === run.id
            const allTempsEntered = run.items.filter(i => i.requireTemp).every(i => i.tempCelsius !== null)

            return (
              <div
                key={run.id}
                className={`rounded-lg border bg-white shadow-sm overflow-hidden ${hasBreaches ? "border-red-200" : "border-border"}`}
              >
                {/* Run header row */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : run.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span className="text-muted-foreground">
                    {isExpanded
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{run.date}</span>
                      <span className="text-xs text-muted-foreground">
                        {VENUE_LABEL[run.venue] ?? run.venue}
                      </span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs text-muted-foreground">{run.templateName}</span>
                      {run.staffNames.length > 0 && (
                        <>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">{run.staffNames.join(", ")}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasBreaches && (
                      <Badge variant="red" className="text-[10px]">Breach</Badge>
                    )}
                    {!hasBreaches && allTempsEntered && run.status === "COMPLETED" && (
                      <Badge variant="green" className="text-[10px]">All pass</Badge>
                    )}
                    {run.status !== "COMPLETED" && (
                      <Badge variant="outline" className="text-[10px]">Incomplete</Badge>
                    )}
                  </div>
                </button>

                {/* Expanded temperature table */}
                {isExpanded && (
                  <div className="border-t border-gray-100">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
                          <th className="px-4 py-2 text-left">Product</th>
                          <th className="px-4 py-2 text-center">Temp</th>
                          <th className="px-4 py-2 text-left hidden sm:table-cell">Note</th>
                          <th className="px-4 py-2 text-left hidden sm:table-cell">Checked by</th>
                          <th className="px-4 py-2 text-left hidden sm:table-cell">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {run.items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={item.passed === false ? "bg-red-50" : ""}
                          >
                            <td className="px-4 py-2.5 font-medium text-gray-900">
                              {item.label.replace(/ — temperature check$/i, "")}
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              {tempBadge(item.passed, item.tempCelsius, item.hotCheck)}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                              {item.note ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                              {item.checkedBy ?? <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell">
                              {item.checkedAt
                                ? new Date(item.checkedAt).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })
                                : <span className="text-gray-300">—</span>
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
