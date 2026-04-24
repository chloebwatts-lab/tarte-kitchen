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
import type {
  CogsDashboardData,
  CogsWeekCell,
  SupplierWeekCell,
} from "@/lib/actions/cogs"

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

// Plain-English pattern description. Looks at the most recent cell vs
// the prior 4-week average and the trend direction over the window.
// Returns null if there isn't enough data to say anything useful.
function buildPatternExplanation(
  cells: CogsWeekCell[],
  suppliers: SupplierWeekCell[],
  venueShort: string
): string | null {
  if (cells.length < 2) return null
  const latest = cells[cells.length - 1]
  const prior = cells.slice(-5, -1)
  if (latest.cogsPct === null) return null

  const priorPcts = prior
    .map((c) => c.cogsPct)
    .filter((v): v is number => v !== null)
  const priorAvg =
    priorPcts.length > 0
      ? priorPcts.reduce((a, b) => a + b, 0) / priorPcts.length
      : null

  const parts: string[] = []
  if (priorAvg !== null) {
    const delta = latest.cogsPct - priorAvg
    const dir = delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat"
    parts.push(
      `${venueShort} landed at ${latest.cogsPct.toFixed(1)}% this week, ` +
        (dir === "flat"
          ? `holding roughly where it's been (4-wk avg ${priorAvg.toFixed(1)}%).`
          : `${dir} ${Math.abs(delta).toFixed(1)}pp on the 4-wk avg of ${priorAvg.toFixed(1)}%.`)
    )
  }

  // Biggest category driver of the shift (where did dollars move?).
  const categoryDeltas: { label: string; delta: number }[] = []
  for (const c of CATEGORIES) {
    const now = latest[c.key]
    const was = prior.map((p) => p[c.key]).filter((v): v is number => v !== null)
    if (now === null || was.length === 0) continue
    const avg = was.reduce((a, b) => a + b, 0) / was.length
    categoryDeltas.push({ label: c.label, delta: now - avg })
  }
  categoryDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const topCat = categoryDeltas[0]
  if (topCat && Math.abs(topCat.delta) > 100) {
    parts.push(
      `${topCat.label} is the main driver — ` +
        `${topCat.delta > 0 ? "up" : "down"} $${Math.abs(Math.round(topCat.delta))} vs the prior 4 weeks.`
    )
  }

  // Supplier spike, if any.
  const spikes = suppliers.filter((s) => s.spike).slice(0, 2)
  if (spikes.length > 0) {
    parts.push(
      `Watch ${spikes.map((s) => s.supplier).join(" + ")} — spending jumped >25% vs the 4-wk avg.`
    )
  } else if (priorAvg !== null && latest.cogsPct - priorAvg > 1) {
    parts.push(
      "No single supplier is spiking, so the lift is spread across the order — tighten par levels on the top categories."
    )
  }

  return parts.join(" ")
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

  // Venue-compare chart data: one row per week, one key per venue for
  // total-COGS %. Always lives below the category chart.
  const compareData = useMemo(() => {
    return initial.weeks.map((iso) => {
      const row: Record<string, string | number | null> = { week: shortLabel(iso) }
      for (const v of SINGLE_VENUES) {
        const cell = initial.perVenue.find((p) => p.venue === v)?.cells[iso]
        row[v] = cell?.cogsPct ?? null
      }
      return row
    })
  }, [initial.weeks, initial.perVenue])

  const suppliers: SupplierWeekCell[] = venueData?.suppliers ?? []

  // Headline numbers so a manager can read the venue's state without
  // parsing the chart first.
  const latestCell = cells[cells.length - 1]
  const priorCells = cells.slice(-5, -1)
  const priorPcts = priorCells
    .map((c) => c.cogsPct)
    .filter((v): v is number => v !== null)
  const priorAvgPct =
    priorPcts.length > 0
      ? priorPcts.reduce((a, b) => a + b, 0) / priorPcts.length
      : null
  const weekOverWeekPct =
    latestCell?.cogsPct !== null &&
    latestCell?.cogsPct !== undefined &&
    priorAvgPct !== null
      ? latestCell.cogsPct - priorAvgPct
      : null
  const patternText = buildPatternExplanation(
    cells,
    suppliers,
    VENUE_SHORT_LABEL[venue]
  )

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

      {latestCell && (
        <Card>
          <CardContent className="pt-5">
            <div className="grid gap-4 sm:grid-cols-4">
              <Stat
                label={`COGS · ${VENUE_SHORT_LABEL[venue]} · latest wk`}
                value={
                  latestCell.cogsPct !== null
                    ? `${latestCell.cogsPct.toFixed(1)}%`
                    : "—"
                }
                sub={`w/e ${shortLabel(latestCell.weekStartWed)}`}
                tone={bandVariant(latestCell.cogsPct)}
              />
              <Stat
                label="COGS $ this week"
                value={`$${Math.round(latestCell.totalCogs).toLocaleString()}`}
                sub={
                  latestCell.revenueExGst
                    ? `on $${Math.round(latestCell.revenueExGst).toLocaleString()} revenue`
                    : undefined
                }
                tone="outline"
              />
              <Stat
                label="vs 4-wk avg"
                value={
                  weekOverWeekPct === null
                    ? "—"
                    : `${weekOverWeekPct > 0 ? "+" : ""}${weekOverWeekPct.toFixed(1)}pp`
                }
                sub={
                  priorAvgPct !== null
                    ? `avg ${priorAvgPct.toFixed(1)}%`
                    : undefined
                }
                tone={
                  weekOverWeekPct === null
                    ? "outline"
                    : weekOverWeekPct > 1
                      ? "red"
                      : weekOverWeekPct < -1
                        ? "green"
                        : "amber"
                }
              />
              <Stat
                label="Supplier spikes"
                value={String(suppliers.filter((s) => s.spike).length)}
                sub={
                  suppliers.filter((s) => s.spike).length === 0
                    ? "none this week"
                    : suppliers
                        .filter((s) => s.spike)
                        .slice(0, 2)
                        .map((s) => s.supplier)
                        .join(" · ")
                }
                tone={
                  suppliers.filter((s) => s.spike).length > 0 ? "red" : "green"
                }
              />
            </div>
            {venue === "BEACH_HOUSE" && (
              <p className="mt-3 text-[11px] italic text-muted-foreground">
                Beach House COGS covers Beach House + Tea Garden combined — stock is
                purchased jointly for both venues.
              </p>
            )}
          </CardContent>
        </Card>
      )}

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
            Total COGS % — all venues
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, "dataMax + 4"]}
                />
                <Tooltip
                  contentStyle={{ fontSize: 11 }}
                  formatter={((v: unknown) => {
                    const n = typeof v === "number" ? v : 0
                    return `${n.toFixed(1)}%`
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  }) as any}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SINGLE_VENUES.map((v) => (
                  <Line
                    key={v}
                    type="monotone"
                    dataKey={v}
                    stroke={VENUE_CHART_COLOR[v]}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                    name={VENUE_SHORT_LABEL[v]}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Suppliers · {VENUE_SHORT_LABEL[venue]}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {suppliers.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No supplier lines yet — upload a COGS xlsx to populate.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-2 py-1.5">Supplier</th>
                    {initial.weeks.slice(-6).map((iso) => (
                      <th key={iso} className="px-2 py-1.5 text-right">
                        {shortLabel(iso)}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right">4wk avg</th>
                    <th className="px-2 py-1.5 text-right">Latest</th>
                    <th className="px-2 py-1.5 text-right">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.slice(0, 25).map((s) => {
                    const delta =
                      s.latest !== null && s.fourWeekAvg && s.fourWeekAvg > 0
                        ? ((s.latest - s.fourWeekAvg) / s.fourWeekAvg) * 100
                        : null
                    return (
                      <tr
                        key={s.supplier}
                        className="border-b border-border/50"
                      >
                        <td className="px-2 py-1.5 font-medium">
                          {s.supplier}
                        </td>
                        {initial.weeks.slice(-6).map((iso) => (
                          <td
                            key={iso}
                            className="px-2 py-1.5 text-right tabular-nums text-muted-foreground"
                          >
                            {s.byWeek[iso] !== undefined
                              ? `$${Math.round(s.byWeek[iso]).toLocaleString()}`
                              : "—"}
                          </td>
                        ))}
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {s.fourWeekAvg !== null
                            ? `$${Math.round(s.fourWeekAvg).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                          {s.latest !== null
                            ? `$${Math.round(s.latest).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {delta !== null && (
                            <span
                              className={cn(
                                "tabular-nums text-[11px]",
                                s.spike
                                  ? "font-medium text-red-600"
                                  : delta < -10
                                    ? "text-emerald-600"
                                    : "text-muted-foreground"
                              )}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(0)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {suppliers.length > 25 && (
                <div className="mt-2 text-center text-[11px] text-muted-foreground">
                  Showing top 25 of {suppliers.length} suppliers by total spend
                </div>
              )}
              <div className="mt-3 text-[11px] text-muted-foreground">
                Δ = latest week vs 4-week avg. Red = spike (+25% or more).
              </div>
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

      {patternText && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              What the pattern says · {VENUE_SHORT_LABEL[venue]}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {patternText}
            </p>
          </CardContent>
        </Card>
      )}
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

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: string
  sub?: string
  tone: "green" | "amber" | "red" | "outline"
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : tone === "green"
          ? "border-emerald-200 bg-emerald-50"
          : "border-border bg-muted/30"
  return (
    <div className={cn("rounded-md border p-3", toneClass)}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
      )}
    </div>
  )
}
