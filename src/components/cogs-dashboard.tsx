"use client"

import { useMemo, useState } from "react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  SINGLE_VENUES,
  VENUE_SHORT_LABEL,
  VENUE_CHART_COLOR,
  type SingleVenue,
} from "@/lib/venues"
import type { CogsDashboardData, CogsWeekCell } from "@/lib/actions/cogs"

const CATEGORIES = [
  { key: "cogsFood" as const, label: "Food", color: "#ef4444" },
  { key: "cogsCoffee" as const, label: "Coffee/tea", color: "#a16207" },
  { key: "cogsDrinks" as const, label: "Drinks", color: "#3b82f6" },
  { key: "cogsPackaging" as const, label: "Packaging", color: "#8b5cf6" },
  { key: "cogsConsumables" as const, label: "Consumables", color: "#64748b" },
]

function bandVariant(pct: number | null): "green" | "amber" | "red" | "outline" {
  if (pct === null) return "outline"
  if (pct < 28) return "green"
  if (pct < 32) return "amber"
  return "red"
}

function shortLabel(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

export function CogsDashboard({ initial }: { initial: CogsDashboardData }) {
  const [venue, setVenue] = useState<SingleVenue>("BURLEIGH")
  const [mode, setMode] = useState<"pct" | "dollars">("pct")

  const venueData = initial.perVenue.find((p) => p.venue === venue)
  const cells: CogsWeekCell[] = useMemo(
    () =>
      initial.weeks
        .map((iso) => venueData?.cells[iso])
        .filter((c): c is CogsWeekCell => c !== undefined),
    [initial.weeks, venueData]
  )

  const chartData = useMemo(() => {
    return cells.map((c) => {
      const rev = c.revenueExGst && c.revenueExGst > 0 ? c.revenueExGst : null
      const toChart = (v: number | null) =>
        v === null
          ? null
          : mode === "pct" && rev
            ? Math.round((v / rev) * 10000) / 100
            : Math.round(v)
      return {
        week: shortLabel(c.weekStartWed),
        total: mode === "pct" ? c.cogsPct : Math.round(c.totalCogs),
        food: toChart(c.cogsFood),
        coffee: toChart(c.cogsCoffee),
        drinks: toChart(c.cogsDrinks),
        packaging: toChart(c.cogsPackaging),
        consumables: toChart(c.cogsConsumables),
      }
    })
  }, [cells, mode])

  const hasData = cells.length > 0

  return (
    <div className="space-y-6">
      {initial.lastUpload && (
        <div className="text-xs text-muted-foreground">
          Last upload: <span className="font-medium text-foreground">{initial.lastUpload.filename}</span> ·{" "}
          {new Date(initial.lastUpload.createdAt).toLocaleString("en-AU", {
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          · {initial.lastUpload.weekCount} week{initial.lastUpload.weekCount === 1 ? "" : "s"}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-border bg-white p-0.5">
          {SINGLE_VENUES.map((v) => (
            <button
              key={v}
              onClick={() => setVenue(v)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium",
                venue === v
                  ? "bg-gray-900 text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {VENUE_SHORT_LABEL[v]}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border border-border bg-white p-0.5">
          {(["pct", "dollars"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "rounded px-3 py-1 text-xs font-medium",
                mode === m
                  ? "bg-gray-900 text-white"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {m === "pct" ? "% of revenue" : "$"}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Category mix — last {initial.weeks.length} weeks ·{" "}
            <span style={{ color: VENUE_CHART_COLOR[venue] }}>
              {VENUE_SHORT_LABEL[venue]}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No COGS data for {VENUE_SHORT_LABEL[venue]} yet. Upload the
              weekly xlsx from{" "}
              <a className="underline" href="/labour/upload">
                /labour/upload
              </a>
              .
            </div>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) =>
                      mode === "pct" ? `${v}%` : `$${v.toLocaleString()}`
                    }
                  />
                  <Tooltip
                    contentStyle={{ fontSize: 11 }}
                    formatter={((v: unknown) => {
                      const n = typeof v === "number" ? v : 0
                      return mode === "pct"
                        ? `${n.toFixed(1)}%`
                        : `$${n.toLocaleString()}`
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    }) as any}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {CATEGORIES.map((c) => (
                    <Line
                      key={c.key}
                      type="monotone"
                      dataKey={c.label.toLowerCase().split("/")[0]}
                      stroke={c.color}
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      name={c.label}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Weekly detail · {VENUE_SHORT_LABEL[venue]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!hasData ? (
            <div className="py-6 text-center text-xs text-muted-foreground">—</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-1.5">Week (Wed)</th>
                    <th className="px-2 py-1.5 text-right">Revenue</th>
                    <th className="px-2 py-1.5 text-right">Food</th>
                    <th className="px-2 py-1.5 text-right">Coffee</th>
                    <th className="px-2 py-1.5 text-right">Drinks</th>
                    <th className="px-2 py-1.5 text-right">Pkg</th>
                    <th className="px-2 py-1.5 text-right">Cons.</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                    <th className="px-2 py-1.5 text-right">%</th>
                  </tr>
                </thead>
                <tbody>
                  {[...cells].reverse().map((c) => (
                    <tr key={c.weekStartWed} className="border-b border-border/50">
                      <td className="px-2 py-1.5 tabular-nums">{c.weekStartWed}</td>
                      <Num v={c.revenueExGst} />
                      <Num v={c.cogsFood} muted />
                      <Num v={c.cogsCoffee} muted />
                      <Num v={c.cogsDrinks} muted />
                      <Num v={c.cogsPackaging} muted />
                      <Num v={c.cogsConsumables} muted />
                      <Num v={c.totalCogs} bold />
                      <td className="px-2 py-1.5 text-right">
                        {c.cogsPct !== null && (
                          <Badge variant={bandVariant(c.cogsPct)}>
                            {c.cogsPct.toFixed(1)}%
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Num({
  v,
  muted,
  bold,
}: {
  v: number | null
  muted?: boolean
  bold?: boolean
}) {
  return (
    <td
      className={cn(
        "px-2 py-1.5 text-right tabular-nums",
        muted && "text-muted-foreground",
        bold && "font-medium"
      )}
    >
      {v === null ? "—" : `$${Math.round(v).toLocaleString()}`}
    </td>
  )
}
