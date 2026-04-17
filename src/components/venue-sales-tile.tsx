"use client"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts"
import type { VenueSalesSnapshot } from "@/lib/actions/venue-metrics"
import { VENUE_LABEL, VENUE_CHART_COLOR } from "@/lib/venues"

export function VenueSalesTile({ snapshot }: { snapshot: VenueSalesSnapshot }) {
  const color = VENUE_CHART_COLOR[snapshot.venue]
  const label = VENUE_LABEL[snapshot.venue]

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">{label}</CardTitle>
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Today</p>
            <p className="text-lg font-semibold">
              {snapshot.today
                ? `$${snapshot.today.revenueExGst.toFixed(0)}`
                : "—"}
            </p>
            <p className="text-xs text-muted-foreground">
              {snapshot.today ? `${snapshot.today.covers} covers` : "no sales"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last 7d</p>
            <p className="text-lg font-semibold">
              ${snapshot.last7.revenueExGst.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {snapshot.last7.covers} covers · ${snapshot.last7.averageSpend.toFixed(1)}
              /cover
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Last 28d</p>
            <p className="text-lg font-semibold">
              ${snapshot.last28.revenueExGst.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">
              {snapshot.last28.covers} covers
            </p>
          </div>
        </div>

        {/* 14-day revenue sparkline */}
        <div className="h-24">
          {snapshot.dailyRevenue.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={snapshot.dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 9 }}
                  tickFormatter={(d) =>
                    new Date(d).toLocaleDateString("en-AU", {
                      day: "numeric",
                    })
                  }
                />
                <YAxis
                  tick={{ fontSize: 9 }}
                  tickFormatter={(v) => `$${Math.round(v / 1000)}k`}
                  width={32}
                />
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
                  stroke={color}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
              No sales data for the last 14 days
            </p>
          )}
        </div>

        {/* Top sellers */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top by quantity (7d)
            </p>
            {snapshot.topSellersQty.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {snapshot.topSellersQty.slice(0, 5).map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {item.qty}×
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Top by revenue (7d)
            </p>
            {snapshot.topSellersRevenue.length === 0 ? (
              <p className="text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {snapshot.topSellersRevenue.slice(0, 5).map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      ${item.revenue.toFixed(0)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
