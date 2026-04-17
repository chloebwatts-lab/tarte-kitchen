"use client"

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle, TrendingDown, Users, DollarSign } from "lucide-react"
import type { WeeklyPnlRow, LabourStats } from "@/lib/actions/xero"

interface Props {
  weeklyPnl: WeeklyPnlRow[]
  labourStats: LabourStats
  xeroConnected: boolean
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n)
}

function formatWeek(date: Date) {
  return new Date(date).toLocaleDateString("en-AU", {
    month: "short",
    day: "numeric",
  })
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border bg-background p-3 shadow-lg text-sm space-y-1">
      <p className="font-semibold text-foreground">Week of {label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.fill }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
      {payload.length === 2 && (
        <p className="border-t pt-1 font-semibold text-foreground">
          Total: {formatCurrency(payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0))}
        </p>
      )}
    </div>
  )
}

export function CostOverviewDashboard({ weeklyPnl, labourStats, xeroConnected }: Props) {
  const latest = weeklyPnl[weeklyPnl.length - 1]
  const prev = weeklyPnl[weeklyPnl.length - 2]

  const latestLabour = latest?.labourCost ?? 0
  const latestWaste = latest?.wasteCost ?? 0
  const latestTotal = latest?.totalKnownCost ?? 0
  const avgLabour = labourStats.thirteenWeekAvg

  const labourVsAvg = avgLabour > 0 ? ((latestLabour - avgLabour) / avgLabour) * 100 : null

  const chartData = weeklyPnl.map((row) => ({
    week: formatWeek(row.weekStart),
    "Labour": row.labourCost,
    "Waste": row.wasteCost,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cost Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly labour and waste costs — last 13 weeks
        </p>
      </div>

      {/* Xero not connected banner */}
      {!xeroConnected && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <span className="font-semibold">Labour data not available — </span>
            connect Xero Payroll in{" "}
            <a href="/settings/integrations" className="underline underline-offset-2 font-medium">
              Settings → Integrations
            </a>{" "}
            to sync weekly payroll costs automatically.
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week — Labour
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {xeroConnected && latest ? formatCurrency(latestLabour) : "—"}
            </p>
            {labourVsAvg !== null && (
              <p className={`mt-1 text-xs ${labourVsAvg > 5 ? "text-red-600" : labourVsAvg < -5 ? "text-green-600" : "text-muted-foreground"}`}>
                {labourVsAvg > 0 ? "+" : ""}{labourVsAvg.toFixed(1)}% vs 13-wk avg
              </p>
            )}
            {latest && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {latest.headcount} employees
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week — Waste
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {latest ? formatCurrency(latestWaste) : "—"}
            </p>
            {prev && (
              <p className={`mt-1 text-xs ${latestWaste > prev.wasteCost ? "text-red-600" : "text-green-600"}`}>
                {latestWaste > prev.wasteCost ? "▲" : "▼"}{" "}
                {formatCurrency(Math.abs(latestWaste - prev.wasteCost))} vs last week
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              This Week — Total Costs
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {latest ? formatCurrency(latestTotal) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Labour + waste combined</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              13-Week Avg Labour
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {xeroConnected && avgLabour > 0 ? formatCurrency(avgLabour) : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Per week, including super</p>
          </CardContent>
        </Card>
      </div>

      {/* Bar chart */}
      {weeklyPnl.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Weekly Cost Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barCategoryGap="25%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 11, fill: "#888" }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#888" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="square"
                  iconSize={10}
                  wrapperStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="Labour" stackId="a" fill="#1a1a1a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Waste" stackId="a" fill="#c4a882" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {xeroConnected
              ? "No pay run data yet. Labour costs will appear here once Xero payroll syncs."
              : "Connect Xero Payroll to see weekly cost data."}
          </CardContent>
        </Card>
      )}

      {/* Weekly table */}
      {weeklyPnl.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Weekly Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Week</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Labour</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Waste</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {[...weeklyPnl].reverse().map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(row.weekStart).toLocaleDateString("en-AU", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {row.labourCost > 0 ? formatCurrency(row.labourCost) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.wasteCost > 0 ? formatCurrency(row.wasteCost) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {formatCurrency(row.totalKnownCost)}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {row.headcount > 0 ? row.headcount : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
