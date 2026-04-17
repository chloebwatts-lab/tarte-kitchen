"use client"

import { useState, useTransition } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts"
import type { AnalysisData } from "@/lib/actions/analysis"
import { getAnalysisData } from "@/lib/actions/analysis"
import type { Venue } from "@/generated/prisma"
import {
  SINGLE_VENUES,
  VENUE_LABEL,
  VENUE_SHORT_LABEL,
  VENUE_CHART_COLOR,
} from "@/lib/venues"

const RANGE_OPTIONS = [
  { days: 7, label: "7d" },
  { days: 28, label: "28d" },
  { days: 90, label: "90d" },
]

type VenueFilter = Venue | "ALL"

export function AnalysisDashboard({ initial }: { initial: AnalysisData }) {
  const [data, setData] = useState<AnalysisData>(initial)
  const [venue, setVenue] = useState<VenueFilter>(initial.venue)
  const [range, setRange] = useState(initial.rangeDays)
  const [isPending, startTransition] = useTransition()

  function refresh(nextVenue: VenueFilter, nextRange: number) {
    setVenue(nextVenue)
    setRange(nextRange)
    startTransition(async () => {
      const d = await getAnalysisData({ venue: nextVenue, rangeDays: nextRange })
      setData(d)
    })
  }

  // Max revenue for heatmap shading
  const maxDowRevenue = Math.max(...data.dowHeatmap.map((r) => r.avgRevenue), 1)

  const accentColor =
    venue === "ALL" ? "#64748b" : VENUE_CHART_COLOR[venue as Venue] ?? "#64748b"

  return (
    <div className="space-y-6">
      {/* Filters */}
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
                "rounded-md px-2.5 py-1 text-xs font-medium border",
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

      {/* KPI row */}
      <div className="grid gap-4 md:grid-cols-4">
        <KpiCard
          label="Revenue (ex GST)"
          value={`$${data.revenueTrend
            .reduce((s, r) => s + r.revenueExGst, 0)
            .toFixed(0)}`}
        />
        <KpiCard
          label="Gross margin"
          value={
            data.grossMargin.some((g) => g.marginPct !== null)
              ? `${avgPct(data.grossMargin.map((g) => g.marginPct))}%`
              : "—"
          }
        />
        <KpiCard
          label="Avg basket"
          value={
            data.basketSize.length > 0
              ? `$${(
                  data.basketSize.reduce((s, r) => s + r.averageSpend, 0) /
                  Math.max(data.basketSize.length, 1)
                ).toFixed(1)}`
              : "—"
          }
        />
        <KpiCard
          label="Food cost %"
          value={
            data.revenueTrend.some((r) => r.foodCostPct !== null)
              ? `${avgPct(data.revenueTrend.map((r) => r.foodCostPct))}%`
              : "—"
          }
        />
      </div>

      {/* Revenue + theoretical COGS trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Revenue vs Theoretical COGS
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                    })
                  }
                />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  formatter={(value) => `$${Number(value).toFixed(0)}`}
                  labelFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  }
                />
                <Line
                  type="monotone"
                  dataKey="revenueExGst"
                  stroke={accentColor}
                  strokeWidth={2}
                  dot={false}
                  name="Revenue (ex GST)"
                />
                <Line
                  type="monotone"
                  dataKey="theoreticalCogs"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  name="Theoretical COGS"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* DoW heatmap + basket size */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Revenue by day of week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-2">
              {data.dowHeatmap.map((row) => {
                const intensity = row.avgRevenue / maxDowRevenue
                return (
                  <div
                    key={row.dow}
                    className="rounded-md p-3 text-center text-xs font-medium text-white"
                    style={{
                      backgroundColor: accentColor,
                      opacity: 0.25 + intensity * 0.75,
                    }}
                  >
                    <div>{row.dowLabel}</div>
                    <div className="mt-1 text-base font-semibold tabular-nums">
                      ${Math.round(row.avgRevenue)}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Average basket size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.basketSize}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(d) =>
                      new Date(d).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                      })
                    }
                  />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip
                    formatter={(value) => `$${Number(value).toFixed(2)}`}
                  />
                  <ReferenceLine y={25} stroke="#e5e7eb" strokeDasharray="3 3" />
                  <Line
                    type="monotone"
                    dataKey="averageSpend"
                    stroke={accentColor}
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Menu mix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Revenue mix by menu category
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.menuMix.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No dish-matched sales for this range.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.menuMix} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="menuCategory"
                    tick={{ fontSize: 10 }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value) => `$${Number(value).toFixed(0)}`}
                  />
                  <Bar dataKey="revenue" fill={accentColor} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Movers + underperformers */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Top risers (vs previous week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.bestSellerMovers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Prev</th>
                    <th className="py-2 text-right">Now</th>
                    <th className="py-2 text-right">Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.bestSellerMovers.map((m) => (
                    <tr key={m.name} className="border-b border-border/50 last:border-0">
                      <td className="py-2 truncate max-w-[200px]">{m.name}</td>
                      <td className="py-2 text-right tabular-nums">{m.prevWeekQty}</td>
                      <td className="py-2 text-right tabular-nums">{m.thisWeekQty}</td>
                      <td
                        className={cn(
                          "py-2 text-right tabular-nums font-medium",
                          m.deltaPct > 0 ? "text-green-600" : "text-red-600"
                        )}
                      >
                        {m.deltaPct > 0 ? "+" : ""}
                        {m.deltaPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Declining items (28d vs prior 28d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.underperformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No items down 30%+ with meaningful prior volume.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Prev 28d</th>
                    <th className="py-2 text-right">Last 28d</th>
                    <th className="py-2 text-right">Δ%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.underperformers.map((m) => (
                    <tr key={m.name} className="border-b border-border/50 last:border-0">
                      <td className="py-2 truncate max-w-[200px]">{m.name}</td>
                      <td className="py-2 text-right tabular-nums">{m.prev28dQty}</td>
                      <td className="py-2 text-right tabular-nums">{m.recent28dQty}</td>
                      <td className="py-2 text-right tabular-nums font-medium text-red-600">
                        {m.dropPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Labour % (org-wide) */}
      {data.labourPct && data.labourPct.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Labour % of revenue (org-wide)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              Labour cost is tracked organisation-wide, not per venue. Add a
              venue field to <code className="rounded bg-muted px-1">WeeklyLabourCost</code>{" "}
              to enable per-venue labour analysis.
            </p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.labourPct}>
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
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip
                    formatter={(value) => `${Number(value).toFixed(1)}%`}
                  />
                  <ReferenceLine y={30} stroke="#ef4444" strokeDasharray="3 3" />
                  <Bar
                    dataKey="pctOfRevenue"
                    fill={accentColor}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {venue !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          Showing data for {VENUE_LABEL[venue as Venue]}. Switch to All Venues to
          compare across concepts.
        </p>
      )}
    </div>
  )
}

function KpiCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}

function avgPct(values: (number | null)[]): string {
  const valid = values.filter((v): v is number => v !== null)
  if (valid.length === 0) return "0.0"
  return (valid.reduce((s, n) => s + n, 0) / valid.length).toFixed(1)
}
