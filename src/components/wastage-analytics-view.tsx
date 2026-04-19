"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import {
  AlertTriangle,
  TrendingUp,
  Sparkles,
  Info,
  AlertCircle,
  Eye,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { WastageAnalytics } from "@/lib/actions/wastage-analytics"
import { getWastageAnalytics } from "@/lib/actions/wastage-analytics"
import type { Venue } from "@/generated/prisma"
import { SINGLE_VENUES, VENUE_SHORT_LABEL, VENUE_CHART_COLOR } from "@/lib/venues"

type VenueFilter = Venue | "ALL"

const RANGE_OPTIONS = [
  { days: 14, label: "14d" },
  { days: 28, label: "28d" },
  { days: 90, label: "90d" },
]

const REASON_LABEL: Record<string, string> = {
  OVERPRODUCTION: "Overproduction",
  SPOILAGE: "Spoilage",
  EXPIRED: "Expired",
  DROPPED: "Dropped",
  STAFF_MEAL: "Staff meal",
  CUSTOMER_RETURN: "Returned",
  QUALITY_ISSUE: "Quality",
  OTHER: "Other",
}

const REASON_COLOR: Record<string, string> = {
  OVERPRODUCTION: "#f59e0b",
  SPOILAGE: "#ef4444",
  EXPIRED: "#dc2626",
  DROPPED: "#8b5cf6",
  STAFF_MEAL: "#06b6d4",
  CUSTOMER_RETURN: "#f97316",
  QUALITY_ISSUE: "#be123c",
  OTHER: "#64748b",
}

export function WastageAnalyticsView({
  initial,
}: {
  initial: WastageAnalytics
}) {
  const [data, setData] = useState<WastageAnalytics>(initial)
  const [venue, setVenue] = useState<VenueFilter>(initial.venue)
  const [range, setRange] = useState(initial.rangeDays)
  const [isPending, startTransition] = useTransition()

  function refresh(nextVenue: VenueFilter, nextRange: number) {
    setVenue(nextVenue)
    setRange(nextRange)
    startTransition(async () => {
      const d = await getWastageAnalytics({
        venue: nextVenue,
        rangeDays: nextRange,
      })
      setData(d)
    })
  }

  const waste = data.wasteAsPctRevenue ?? 0
  const wastePctVariant =
    waste < 2 ? "green" : waste < 3 ? "amber" : "red"

  return (
    <div className={cn("space-y-6", isPending && "opacity-80")}>
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
                onClick={() => refresh(value, range)}
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
          <div className="flex gap-1">
            {RANGE_OPTIONS.map(({ days, label }) => (
              <button
                key={days}
                onClick={() => refresh(venue, days)}
                disabled={isPending}
                className={cn(
                  "rounded-md border px-2.5 py-1 text-xs font-medium",
                  range === days
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <Link
          href="/wastage"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← Back to wastage entries
        </Link>
      </div>

      {/* Top KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total waste cost</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${data.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.totalEntries} entries · {data.rangeDays}d
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">% of revenue</p>
            <p className="mt-1 text-3xl font-bold">
              {data.wasteAsPctRevenue !== null ? (
                <Badge variant={wastePctVariant} className="px-3 py-1 text-lg">
                  {data.wasteAsPctRevenue.toFixed(2)}%
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Industry benchmark &lt; 3%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Trending up</p>
            <p className="mt-1 text-3xl font-bold">{data.trendingUp.length}</p>
            <p className="text-xs text-muted-foreground">
              items +30% in last 14 days
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Unaccounted loss</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-red-600">
              $
              {data.shrinkage
                .reduce((s, x) => s + x.unaccountedValue, 0)
                .toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              stocktake variance − reported waste
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-indigo-500" />
              Recommendations
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recommendations.map((r, i) => {
              const Icon =
                r.severity === "critical"
                  ? AlertCircle
                  : r.severity === "warn"
                    ? AlertTriangle
                    : Info
              const bg =
                r.severity === "critical"
                  ? "border-red-200 bg-red-50"
                  : r.severity === "warn"
                    ? "border-amber-200 bg-amber-50"
                    : "border-blue-200 bg-blue-50"
              const iconColor =
                r.severity === "critical"
                  ? "text-red-600"
                  : r.severity === "warn"
                    ? "text-amber-600"
                    : "text-blue-600"
              return (
                <div
                  key={i}
                  className={cn("rounded-md border p-3", bg)}
                >
                  <div className="flex items-start gap-2">
                    <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", iconColor)} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{r.title}</div>
                      <div className="mt-0.5 text-xs text-foreground/80">
                        {r.body}
                      </div>
                      {r.action && (
                        <Link
                          href={r.action.href}
                          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                        >
                          <Eye className="h-3 w-3" />
                          {r.action.label}
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {/* Weekly trend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Weekly waste vs revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.byWeek.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No data.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.byWeek}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="weekStart"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })
                    }
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) =>
                      name === "pctOfRevenue"
                        ? `${Number(value).toFixed(2)}%`
                        : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    }
                    labelFormatter={(d) =>
                      `Week of ${new Date(d).toLocaleDateString("en-AU")}`
                    }
                  />
                  <ReferenceLine yAxisId="left" y={3} stroke="#ef4444" strokeDasharray="3 3" />
                  <Line
                    yAxisId="left"
                    dataKey="pctOfRevenue"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={false}
                    name="pctOfRevenue"
                  />
                  <Line
                    yAxisId="right"
                    dataKey="cost"
                    stroke="#6b7280"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    name="cost"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex gap-4 text-[10px] text-muted-foreground">
            <span>
              <span className="inline-block h-1.5 w-3 bg-red-500 align-middle" />{" "}
              Waste % of revenue (left axis)
            </span>
            <span>
              <span className="inline-block h-1.5 w-3 border-t border-dashed border-gray-400 align-middle" />{" "}
              Waste $ (right axis)
            </span>
            <span>Dashed line = 3% benchmark</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* By reason */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By reason</CardTitle>
          </CardHeader>
          <CardContent>
            {data.byReason.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No data.
              </p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.byReason} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <YAxis
                      type="category"
                      dataKey="reason"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(r) => REASON_LABEL[r] ?? r}
                      width={95}
                    />
                    <Tooltip
                      formatter={(v: number, _n, p) => [
                        `$${Number(v).toFixed(2)}`,
                        `${REASON_LABEL[p.payload.reason]} · ${p.payload.pctOfTotal}%`,
                      ]}
                    />
                    <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                      {data.byReason.map((r) => (
                        <rect
                          key={r.reason}
                          fill={REASON_COLOR[r.reason] ?? "#64748b"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* By venue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              By venue — cost & % of revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.byVenue.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No data.
              </p>
            ) : (
              <div className="space-y-3">
                {data.byVenue.map((v) => {
                  const pct = v.pctOfRevenue ?? 0
                  const variant = pct < 2 ? "green" : pct < 3 ? "amber" : "red"
                  return (
                    <div key={v.venue} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span
                          className="text-sm font-medium"
                          style={{ color: VENUE_CHART_COLOR[v.venue] }}
                        >
                          {VENUE_SHORT_LABEL[v.venue]}
                        </span>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="tabular-nums">${v.cost.toFixed(0)}</span>
                          {v.pctOfRevenue !== null && (
                            <Badge variant={variant} className="text-[10px]">
                              {v.pctOfRevenue.toFixed(2)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(pct * 20, 100)}%`,
                            backgroundColor: VENUE_CHART_COLOR[v.venue],
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top items + trending up */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Top items by $ waste
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.topItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No entries.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Entries</th>
                    <th className="py-2 text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.topItems.map((i, idx) => (
                    <tr key={idx} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-2">
                        <Link
                          href={`/wastage?search=${encodeURIComponent(i.itemName)}`}
                          className="font-medium hover:underline"
                        >
                          {i.itemName}
                        </Link>
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {i.quantity} {i.unit ?? ""}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {i.entries}
                      </td>
                      <td className="py-2 text-right tabular-nums font-medium">
                        ${i.cost.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="h-4 w-4 text-red-500" />
              Spiking items (last 14d vs prior 14d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.trendingUp.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nothing trending up.
              </p>
            ) : (
              <div className="space-y-1">
                {data.trendingUp.map((t, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/wastage?search=${encodeURIComponent(t.itemName)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {t.itemName}
                      </Link>
                      <div className="text-[10px] text-muted-foreground">
                        ${t.prior14dCost.toFixed(0)} → ${t.recent14dCost.toFixed(0)}
                      </div>
                    </div>
                    <Badge variant="red" className="tabular-nums">
                      +{t.deltaPct}%
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Shrinkage detective */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Shrinkage detective
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Stocktake said we had less than we should — and the gap isn&apos;t
            explained by logged wastage. That&apos;s over-portioning,
            unrecorded staff meals, theft, or dropped items that never made
            it into the log.
          </p>
        </CardHeader>
        <CardContent>
          {data.shrinkage.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No shrinkage flagged. You need at least two submitted stocktakes
              per venue for this to populate.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2">Ingredient</th>
                  <th className="py-2 text-right">Stocktake said lost</th>
                  <th className="py-2 text-right">Reported waste</th>
                  <th className="py-2 text-right">Unaccounted $</th>
                </tr>
              </thead>
              <tbody>
                {data.shrinkage.map((s) => (
                  <tr
                    key={s.ingredientId}
                    className="border-b border-border/50 last:border-0"
                  >
                    <td className="py-2 pr-2 font-medium">
                      {s.ingredientName}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {s.variancePositiveBase} {s.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">
                      {s.reportedWasteBase} {s.unit}
                    </td>
                    <td className="py-2 text-right tabular-nums font-semibold text-red-600">
                      ${s.unaccountedValue.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
