"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import { Star, TrendingDown, Puzzle, Dog, Download } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type {
  MenuEngineeringData,
  MenuEngineeringItem,
  MenuQuadrant,
} from "@/lib/actions/menu-engineering"
import { getMenuEngineeringData } from "@/lib/actions/menu-engineering"
import type { Venue } from "@/generated/prisma"
import {
  SINGLE_VENUES,
  VENUE_LABEL,
  VENUE_SHORT_LABEL,
} from "@/lib/venues"

type VenueFilter = Venue | "ALL"

const RANGE_OPTIONS = [
  { days: 7, label: "7d" },
  { days: 28, label: "28d" },
  { days: 90, label: "90d" },
]

interface QuadrantMeta {
  key: MenuQuadrant
  label: string
  shortLabel: string
  emoji: string
  color: string
  fillClass: string
  borderClass: string
  textClass: string
  tagline: string
  action: string
  Icon: typeof Star
}

const QUADRANT_META: Record<MenuQuadrant, QuadrantMeta> = {
  STAR: {
    key: "STAR",
    label: "Stars",
    shortLabel: "Stars",
    emoji: "⭐",
    color: "#10b981", // emerald-500
    fillClass: "bg-emerald-50 dark:bg-emerald-950/40",
    borderClass: "border-emerald-200 dark:border-emerald-900",
    textClass: "text-emerald-700 dark:text-emerald-300",
    tagline: "High popularity · High margin",
    action:
      "Protect recipe & quality. Feature prominently on menu. Hold pricing — don't risk demand.",
    Icon: Star,
  },
  PLOWHORSE: {
    key: "PLOWHORSE",
    label: "Plowhorses",
    shortLabel: "Plowhorses",
    emoji: "🐎",
    color: "#f59e0b", // amber-500
    fillClass: "bg-amber-50 dark:bg-amber-950/40",
    borderClass: "border-amber-200 dark:border-amber-900",
    textClass: "text-amber-700 dark:text-amber-300",
    tagline: "High popularity · Low margin",
    action:
      "Trim cost or lift price $1–2. Popular enough to absorb a nudge. Re-engineer portion or swap a costly component.",
    Icon: TrendingDown,
  },
  PUZZLE: {
    key: "PUZZLE",
    label: "Puzzles",
    shortLabel: "Puzzles",
    emoji: "🧩",
    color: "#6366f1", // indigo-500
    fillClass: "bg-indigo-50 dark:bg-indigo-950/40",
    borderClass: "border-indigo-200 dark:border-indigo-900",
    textClass: "text-indigo-700 dark:text-indigo-300",
    tagline: "Low popularity · High margin",
    action:
      "Promote hard. Rename, reposition on menu, add a photo, brief staff to upsell. Hidden profit.",
    Icon: Puzzle,
  },
  DOG: {
    key: "DOG",
    label: "Dogs",
    shortLabel: "Dogs",
    emoji: "🐕",
    color: "#ef4444", // red-500
    fillClass: "bg-red-50 dark:bg-red-950/40",
    borderClass: "border-red-200 dark:border-red-900",
    textClass: "text-red-700 dark:text-red-300",
    tagline: "Low popularity · Low margin",
    action:
      "Remove from menu or reinvent. Every dog slot crowds out a potential star.",
    Icon: Dog,
  },
}

const QUADRANT_ORDER: MenuQuadrant[] = ["STAR", "PLOWHORSE", "PUZZLE", "DOG"]

export function MenuEngineeringDashboard({
  initial,
}: {
  initial: MenuEngineeringData
}) {
  const [data, setData] = useState<MenuEngineeringData>(initial)
  const [venue, setVenue] = useState<VenueFilter>(initial.venue)
  const [range, setRange] = useState(initial.rangeDays)
  const [activeQuadrant, setActiveQuadrant] = useState<MenuQuadrant | "ALL">(
    "ALL"
  )
  const [hoverDishId, setHoverDishId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function refresh(nextVenue: VenueFilter, nextRange: number) {
    setVenue(nextVenue)
    setRange(nextRange)
    startTransition(async () => {
      const d = await getMenuEngineeringData({
        venue: nextVenue,
        rangeDays: nextRange,
      })
      setData(d)
    })
  }

  const filteredItems = useMemo(() => {
    if (activeQuadrant === "ALL") return data.items
    return data.items.filter((i) => i.quadrant === activeQuadrant)
  }, [data.items, activeQuadrant])

  const scatterData = data.items.map((i) => ({
    x: i.unitsSold,
    y: i.grossProfitPerUnit,
    z: Math.max(i.profitContribution, 1),
    dishId: i.dishId,
    name: i.name,
    quadrant: i.quadrant,
    foodCostPct: i.foodCostPct,
    revenueExGst: i.revenueExGst,
    profitContribution: i.profitContribution,
  }))

  function exportCsv() {
    const header = [
      "Dish",
      "Venue",
      "Category",
      "Quadrant",
      "Units sold",
      "Selling price (inc GST)",
      "Food cost %",
      "GP per unit",
      "Profit contribution",
      "Revenue (ex GST)",
    ].join(",")
    const rows = data.items.map((i) =>
      [
        escapeCsv(i.name),
        i.venue,
        i.menuCategory,
        i.quadrant,
        i.unitsSold,
        i.sellingPrice.toFixed(2),
        i.foodCostPct.toFixed(1),
        i.grossProfitPerUnit.toFixed(2),
        i.profitContribution.toFixed(2),
        i.revenueExGst.toFixed(2),
      ].join(",")
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `menu-engineering-${data.venue}-${data.rangeDays}d.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

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
        <button
          onClick={exportCsv}
          disabled={data.items.length === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* Quadrant summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {QUADRANT_ORDER.map((q) => {
          const meta = QUADRANT_META[q]
          const quad = data.quadrants[q]
          const isActive = activeQuadrant === q
          const Icon = meta.Icon
          return (
            <button
              key={q}
              type="button"
              onClick={() =>
                setActiveQuadrant(isActive ? "ALL" : q)
              }
              className={cn(
                "group rounded-lg border p-4 text-left transition-all",
                meta.fillClass,
                meta.borderClass,
                isActive
                  ? "ring-2 ring-offset-2 shadow-md"
                  : "hover:shadow-sm"
              )}
              style={isActive ? { boxShadow: `0 0 0 2px ${meta.color}` } : undefined}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div
                    className={cn(
                      "inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide",
                      meta.textClass
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.label}
                  </div>
                  <p className="mt-1 text-3xl font-bold tabular-nums">
                    {quad.count}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {quad.count === 1 ? "dish" : "dishes"}
                  </p>
                </div>
                <span className="text-2xl">{meta.emoji}</span>
              </div>
              <div className="mt-4 space-y-0.5 border-t pt-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Units sold</span>
                  <span className="font-medium tabular-nums">
                    {quad.unitsSold.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">GP contribution</span>
                  <span className="font-medium tabular-nums">
                    ${quad.profitContribution.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Scatter matrix + legend / recommendations */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">
                Menu matrix — popularity vs margin
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {data.items.length} dish{data.items.length === 1 ? "" : "es"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="relative h-[420px]">
              {data.items.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  No dish-matched sales for this range. Check your POS sync in
                  Settings → Integrations.
                </div>
              ) : (
                <>
                  {/* Quadrant labels overlay */}
                  <div className="pointer-events-none absolute inset-0 z-10">
                    <QuadrantLabel
                      position="top-left"
                      meta={QUADRANT_META.PUZZLE}
                    />
                    <QuadrantLabel
                      position="top-right"
                      meta={QUADRANT_META.STAR}
                    />
                    <QuadrantLabel
                      position="bottom-left"
                      meta={QUADRANT_META.DOG}
                    />
                    <QuadrantLabel
                      position="bottom-right"
                      meta={QUADRANT_META.PLOWHORSE}
                    />
                  </div>

                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart
                      margin={{ top: 30, right: 30, bottom: 40, left: 50 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis
                        type="number"
                        dataKey="x"
                        name="Units sold"
                        tick={{ fontSize: 10 }}
                        label={{
                          value: `Units sold · ${data.rangeDays}d`,
                          position: "insideBottom",
                          offset: -15,
                          style: { fontSize: 11, fill: "#6b7280" },
                        }}
                      />
                      <YAxis
                        type="number"
                        dataKey="y"
                        name="GP per unit"
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `$${v}`}
                        label={{
                          value: "Gross profit / unit",
                          angle: -90,
                          position: "insideLeft",
                          offset: 10,
                          style: { fontSize: 11, fill: "#6b7280" },
                        }}
                      />
                      <ZAxis
                        type="number"
                        dataKey="z"
                        range={[40, 400]}
                        name="Profit contribution"
                      />
                      <ReferenceLine
                        x={data.popularityThreshold}
                        stroke="#9ca3af"
                        strokeDasharray="4 4"
                      />
                      <ReferenceLine
                        y={data.profitThreshold}
                        stroke="#9ca3af"
                        strokeDasharray="4 4"
                      />
                      <Tooltip
                        cursor={{ strokeDasharray: "3 3" }}
                        content={<ScatterTooltip />}
                      />
                      <Scatter data={scatterData}>
                        {scatterData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={QUADRANT_META[entry.quadrant].color}
                            fillOpacity={
                              hoverDishId === null ||
                              hoverDishId === entry.dishId
                                ? 0.8
                                : 0.2
                            }
                            stroke={QUADRANT_META[entry.quadrant].color}
                            strokeWidth={
                              hoverDishId === entry.dishId ? 2 : 0
                            }
                            onMouseEnter={() => setHoverDishId(entry.dishId)}
                            onMouseLeave={() => setHoverDishId(null)}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </>
              )}
            </div>
            {data.items.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Popularity median:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {data.popularityThreshold} units
                  </span>
                </span>
                <span>
                  Margin median:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    ${data.profitThreshold.toFixed(2)}/unit
                  </span>
                </span>
                <span>
                  Dot size = profit contribution ($)
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              Strategic actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {QUADRANT_ORDER.map((q) => {
              const meta = QUADRANT_META[q]
              const Icon = meta.Icon
              return (
                <div
                  key={q}
                  className={cn(
                    "rounded-md border p-3",
                    meta.fillClass,
                    meta.borderClass
                  )}
                >
                  <div
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold",
                      meta.textClass
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.emoji} {meta.label}
                    <span className="font-normal text-muted-foreground">
                      — {meta.tagline}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-foreground/80">
                    {meta.action}
                  </p>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      {/* Item list */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-sm font-medium">
              {activeQuadrant === "ALL"
                ? "All classified dishes"
                : `${QUADRANT_META[activeQuadrant].label}`}{" "}
              <span className="ml-1 font-normal text-muted-foreground">
                ({filteredItems.length})
              </span>
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setActiveQuadrant("ALL")}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium border",
                  activeQuadrant === "ALL"
                    ? "border-gray-900 bg-gray-900 text-white"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                )}
              >
                All
              </button>
              {QUADRANT_ORDER.map((q) => {
                const meta = QUADRANT_META[q]
                const isActive = activeQuadrant === q
                return (
                  <button
                    key={q}
                    onClick={() => setActiveQuadrant(q)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-xs font-medium",
                      isActive
                        ? "border-gray-900 text-white"
                        : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                    )}
                    style={
                      isActive
                        ? { backgroundColor: meta.color, borderColor: meta.color }
                        : undefined
                    }
                  >
                    {meta.emoji} {meta.shortLabel}
                  </button>
                )
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No dishes in this quadrant.
            </p>
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pl-6">Dish</th>
                    <th className="py-2">Quadrant</th>
                    <th className="py-2 text-right">Sold</th>
                    <th className="py-2 text-right">FC%</th>
                    <th className="py-2 text-right">GP/unit</th>
                    <th className="py-2 pr-6 text-right">GP contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((i) => (
                    <ItemRow key={i.dishId} item={i} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {venue !== "ALL" && (
        <p className="text-xs text-muted-foreground">
          Showing data for {VENUE_LABEL[venue as Venue]} over the last{" "}
          {data.rangeDays} days.
        </p>
      )}
    </div>
  )
}

function ItemRow({ item }: { item: MenuEngineeringItem }) {
  const meta = QUADRANT_META[item.quadrant]
  const fcVariant =
    item.foodCostPct < 30
      ? "green"
      : item.foodCostPct <= 35
        ? "amber"
        : "red"
  return (
    <tr className="border-b border-border/50 hover:bg-muted/40 last:border-0">
      <td className="py-2 pl-6">
        <Link
          href={`/dishes?search=${encodeURIComponent(item.name)}`}
          className="font-medium hover:underline"
        >
          {item.name}
        </Link>
        <div className="text-[10px] text-muted-foreground">
          {item.venue} · {item.menuCategory}
        </div>
      </td>
      <td className="py-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
          style={{
            backgroundColor: meta.color + "1a",
            color: meta.color,
          }}
        >
          {meta.emoji} {meta.shortLabel}
        </span>
      </td>
      <td className="py-2 text-right tabular-nums">{item.unitsSold}</td>
      <td className="py-2 text-right">
        <Badge variant={fcVariant} className="text-[10px]">
          {item.foodCostPct.toFixed(1)}%
        </Badge>
      </td>
      <td className="py-2 text-right tabular-nums">
        ${item.grossProfitPerUnit.toFixed(2)}
      </td>
      <td className="py-2 pr-6 text-right tabular-nums font-medium">
        ${item.profitContribution.toLocaleString(undefined, { maximumFractionDigits: 0 })}
      </td>
    </tr>
  )
}

interface ScatterPayloadEntry {
  payload?: {
    name?: string
    quadrant?: MenuQuadrant
    x?: number
    y?: number
    foodCostPct?: number
    profitContribution?: number
  }
}

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ScatterPayloadEntry[]
}) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  if (!p || !p.quadrant) return null
  const meta = QUADRANT_META[p.quadrant]
  return (
    <div className="rounded-md border border-border bg-background p-2.5 text-xs shadow-lg">
      <div className="font-medium">{p.name}</div>
      <div
        className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium"
        style={{ color: meta.color }}
      >
        {meta.emoji} {meta.label}
      </div>
      <div className="mt-2 space-y-0.5 tabular-nums">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Units sold</span>
          <span>{p.x}</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Food cost</span>
          <span>{(p.foodCostPct ?? 0).toFixed(1)}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">GP / unit</span>
          <span>${(p.y ?? 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between gap-4 border-t pt-0.5">
          <span className="text-muted-foreground">GP contribution</span>
          <span className="font-medium">
            $
            {(p.profitContribution ?? 0).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </span>
        </div>
      </div>
    </div>
  )
}

function QuadrantLabel({
  position,
  meta,
}: {
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right"
  meta: QuadrantMeta
}) {
  const pos = {
    "top-left": "top-2 left-14",
    "top-right": "top-2 right-4",
    "bottom-left": "bottom-12 left-14",
    "bottom-right": "bottom-12 right-4",
  }[position]
  return (
    <div
      className={cn(
        "absolute text-[10px] font-semibold uppercase tracking-wide opacity-60",
        pos
      )}
      style={{ color: meta.color }}
    >
      {meta.emoji} {meta.shortLabel}
    </div>
  )
}

function escapeCsv(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}
