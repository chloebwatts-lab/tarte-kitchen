"use client"

import { useState, useTransition } from "react"
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts"
import { AlertTriangle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { SINGLE_VENUES, VENUE_SHORT_LABEL, VENUE_CHART_COLOR } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"
import type { LabourDashboardData } from "@/lib/actions/labour"
import { getLabourDashboardData } from "@/lib/actions/labour"

type VenueFilter = Venue | "ALL"

const RANGE_OPTIONS = [
  { days: 7, label: "7d" },
  { days: 28, label: "28d" },
  { days: 90, label: "90d" },
]

export function LabourDashboard({
  initial,
}: {
  initial: LabourDashboardData
}) {
  const [data, setData] = useState<LabourDashboardData>(initial)
  const [venue, setVenue] = useState<VenueFilter>(initial.venue)
  const [range, setRange] = useState(initial.rangeDays)
  const [isPending, startTransition] = useTransition()

  function refresh(nextVenue: VenueFilter, nextRange: number) {
    setVenue(nextVenue)
    setRange(nextRange)
    startTransition(async () => {
      const d = await getLabourDashboardData({
        venue: nextVenue,
        rangeDays: nextRange,
      })
      setData(d)
    })
  }

  const labourVariant =
    data.labourPct === null
      ? "outline"
      : data.labourPct < 28
        ? "green"
        : data.labourPct < 34
          ? "amber"
          : "red"

  return (
    <div className={cn("space-y-6", isPending && "opacity-80")}>
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
                "rounded-full px-4 py-1.5 text-xs font-medium",
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

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Labour % of revenue</p>
            <p className="mt-1 text-3xl font-bold">
              {data.labourPct !== null ? (
                <Badge variant={labourVariant} className="px-3 py-1 text-lg">
                  {data.labourPct.toFixed(1)}%
                </Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">Target &lt; 30%</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total labour cost</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${data.totalCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Hours worked</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {data.totalHours.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Revenue (ex GST)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${data.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Daily labour % vs revenue
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.byDay.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No labour data yet. Sync Deputy via the cron (or from Settings →
              Integrations) to populate.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.byDay}>
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
                        ? `${Number(value).toFixed(1)}%`
                        : `$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                    }
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={30}
                    stroke="#f59e0b"
                    strokeDasharray="3 3"
                  />
                  <ReferenceLine
                    yAxisId="left"
                    y={35}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                  />
                  <Line
                    yAxisId="left"
                    dataKey="pctOfRevenue"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={false}
                    name="pctOfRevenue"
                  />
                  <Line
                    yAxisId="right"
                    dataKey="cost"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                    name="cost"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* By venue */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By venue</CardTitle>
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
                  const variant =
                    pct < 28 ? "green" : pct < 34 ? "amber" : "red"
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
                          <span className="tabular-nums">
                            ${v.cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            · {v.hours.toFixed(0)}h
                          </span>
                          {v.pctOfRevenue !== null && (
                            <Badge variant={variant} className="text-[10px]">
                              {v.pctOfRevenue.toFixed(1)}%
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full"
                          style={{
                            width: `${Math.min(pct * 2, 100)}%`,
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

        {/* Highest labour days */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="inline-flex items-center gap-1.5 text-sm font-medium">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Biggest labour % days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.highestLabourDays.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No data.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2">Date</th>
                    <th className="py-2">Venue</th>
                    <th className="py-2 text-right">Labour $</th>
                    <th className="py-2 text-right">Rev</th>
                    <th className="py-2 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.highestLabourDays.map((d, i) => {
                    const variant =
                      d.pctOfRevenue < 28
                        ? "green"
                        : d.pctOfRevenue < 34
                          ? "amber"
                          : "red"
                    return (
                      <tr
                        key={i}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2">
                          {new Date(d.date).toLocaleDateString("en-AU", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </td>
                        <td className="py-2 text-xs">
                          {VENUE_SHORT_LABEL[d.venue]}
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          ${d.cost.toFixed(0)}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          ${d.revenue.toFixed(0)}
                        </td>
                        <td className="py-2 text-right">
                          <Badge variant={variant} className="text-[10px]">
                            {d.pctOfRevenue.toFixed(1)}%
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* By employee */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">By employee</CardTitle>
        </CardHeader>
        <CardContent>
          {data.byEmployee.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No data.
            </p>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.byEmployee} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="employeeName"
                    tick={{ fontSize: 10 }}
                    width={110}
                  />
                  <Tooltip
                    formatter={(v: number, _n, p) => [
                      `$${Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
                      `${p.payload.hours}h · ${p.payload.shifts} shifts`,
                    ]}
                  />
                  <Bar dataKey="cost" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
