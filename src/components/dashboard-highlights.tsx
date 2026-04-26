import Link from "next/link"
import {
  TrendingUp,
  Trash2,
  ArrowUpRight,
  ArrowDownRight,
  Banknote,
} from "lucide-react"
import type { DashboardHighlights } from "@/lib/actions/dashboard"

function pctColor(pct: number | null, kind: "sales" | "waste"): string {
  if (pct === null) return "text-muted-foreground"
  if (kind === "sales") {
    // % of daily target — higher is better.
    if (pct >= 95) return "text-emerald-700"
    if (pct >= 80) return "text-amber-700"
    return "text-red-700"
  }
  // waste week-over-week — lower is better, negative = improvement.
  if (pct <= -10) return "text-emerald-700"
  if (pct <= 10) return "text-muted-foreground"
  return "text-red-700"
}

export function DashboardHighlights({
  data,
}: {
  data: DashboardHighlights
}) {
  const { salesToday, waste, supplierSpike } = data

  const salesPct =
    salesToday.totalDailyTarget && salesToday.totalDailyTarget > 0
      ? Math.round((salesToday.totalRevenue / salesToday.totalDailyTarget) * 1000) / 10
      : null

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {/* ── Sales vs daily target ────────────────────────────────────── */}
      <Link
        href="/dashboard"
        className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:shadow-sm"
      >
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Banknote className="h-3.5 w-3.5" />
          Sales today
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            ${Math.round(salesToday.totalRevenue).toLocaleString()}
          </span>
          {salesPct !== null && (
            <span
              className={`text-sm font-semibold tabular-nums ${pctColor(salesPct, "sales")}`}
            >
              {salesPct.toFixed(0)}% of target
            </span>
          )}
        </div>
        {salesToday.totalDailyTarget !== null ? (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            target ${Math.round(salesToday.totalDailyTarget).toLocaleString()}/day
            (forecast ÷ 7)
          </p>
        ) : (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            No weekly forecast set — enter on /labour/upload
          </p>
        )}
        <div className="mt-2 space-y-0.5">
          {salesToday.perVenue.map((v) => (
            <div
              key={v.venue}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-muted-foreground">{v.label}</span>
              <span className="tabular-nums">
                ${Math.round(v.revenueExGst).toLocaleString()}
                {v.pctOfTarget !== null && (
                  <span
                    className={`ml-1 text-[10px] ${pctColor(v.pctOfTarget, "sales")}`}
                  >
                    ({v.pctOfTarget.toFixed(0)}%)
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Link>

      {/* ── Waste this week ─────────────────────────────────────────── */}
      <Link
        href="/wastage"
        className="group rounded-xl border border-gray-200 bg-white p-4 transition hover:shadow-sm"
      >
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <Trash2 className="h-3.5 w-3.5" />
          Waste this week
        </div>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-2xl font-bold tabular-nums">
            ${Math.round(waste.totalCost).toLocaleString()}
          </span>
          {waste.weekOverWeekChange !== null && (
            <span
              className={`flex items-center gap-0.5 text-sm font-semibold tabular-nums ${pctColor(waste.weekOverWeekChange, "waste")}`}
            >
              {waste.weekOverWeekChange > 0 ? (
                <ArrowUpRight className="h-3 w-3" />
              ) : (
                <ArrowDownRight className="h-3 w-3" />
              )}
              {Math.abs(waste.weekOverWeekChange).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {waste.weekLabel} · vs last week
        </p>
        {waste.topItem ? (
          <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 text-[11px]">
            <p className="font-medium text-foreground">
              Top: {waste.topItem.name}
            </p>
            <p className="text-muted-foreground tabular-nums">
              ${waste.topItem.cost.toFixed(0)} · {waste.topItem.venue}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Nothing logged yet this week
          </p>
        )}
      </Link>

      {/* ── Top supplier spike ───────────────────────────────────────── */}
      <Link
        href="/cogs"
        className={`group rounded-xl border p-4 transition hover:shadow-sm ${
          supplierSpike ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"
        }`}
      >
        <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-muted-foreground">
          <TrendingUp className="h-3.5 w-3.5" />
          Top supplier spike
        </div>
        {supplierSpike ? (
          <>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums text-red-700">
                +{supplierSpike.pctIncrease.toFixed(0)}%
              </span>
              <span className="text-sm tabular-nums text-muted-foreground">
                ${Math.round(supplierSpike.latestAmount).toLocaleString()}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {supplierSpike.weekLabel} · {supplierSpike.venueLabel} · vs 4-wk avg
              ${Math.round(supplierSpike.fourWeekAvg).toLocaleString()}
            </p>
            <p className="mt-2 truncate text-sm font-medium">
              {supplierSpike.supplier}
            </p>
          </>
        ) : (
          <>
            <div className="mt-2 text-2xl font-bold tabular-nums text-emerald-700">
              No spike
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              All suppliers within 25% of their 4-wk avg
            </p>
          </>
        )}
      </Link>
    </div>
  )
}
