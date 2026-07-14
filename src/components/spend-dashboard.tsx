"use client"

import { useState, useTransition } from "react"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { assignInvoiceVenue } from "@/lib/spend/current-week"
import type {
  CurrentWeekSpendSnapshot,
  BucketSpendData,
} from "@/lib/spend/types"
import { Venue } from "@/generated/prisma"

const fmt = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
      }).format(n)

const paceBadge: Record<
  BucketSpendData["paceStatus"],
  { label: string; variant: "green" | "amber" | "red" | "outline" }
> = {
  "on-track": { label: "On track", variant: "green" },
  watch: { label: "Watch", variant: "amber" },
  over: { label: "Over budget pace", variant: "red" },
  "no-forecast": { label: "No forecast set", variant: "outline" },
}

function PaceBadge({ status }: { status: BucketSpendData["paceStatus"] }) {
  const { label, variant } = paceBadge[status]
  const cls =
    variant === "green"
      ? "border-green-text/30 bg-green-light text-green-text"
      : variant === "amber"
      ? "border-amber-text/30 bg-amber-light text-amber-text"
      : variant === "red"
      ? "border-red-text/30 bg-red-light text-red-text"
      : "border-input bg-white text-muted-foreground"
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        cls
      )}
    >
      {label}
    </span>
  )
}

function BucketCard({ bucket }: { bucket: BucketSpendData }) {
  const remainPct =
    bucket.budget && bucket.budget > 0
      ? (bucket.remaining ?? 0) / bucket.budget
      : null
  const projectedPct =
    bucket.budget && bucket.budget > 0
      ? bucket.projectedEndOfWeek / bucket.budget
      : null
  // Where the week's COGS % lands if spend keeps this pace, against the
  // sales forecast ("137% of budget" ⇒ 137% × target%).
  const projectedCogsPct =
    bucket.forecastRevenue && bucket.forecastRevenue > 0
      ? (bucket.projectedEndOfWeek / bucket.forecastRevenue) * 100
      : null
  // Same, but against ACTUAL revenue pace from the Lightspeed EOD
  // reports — the honest read when trade runs above/below forecast.
  const liveCogsPct =
    bucket.projectedRevenueExGst && bucket.projectedRevenueExGst > 0
      ? (bucket.projectedEndOfWeek / bucket.projectedRevenueExGst) * 100
      : null
  const revenuePaceOfForecast =
    bucket.projectedRevenueExGst != null &&
    bucket.forecastRevenue != null &&
    bucket.forecastRevenue > 0
      ? (bucket.projectedRevenueExGst / bucket.forecastRevenue) * 100
      : null

  const cogsTone = (pct: number | null): "green" | "amber" | "red" | undefined =>
    pct == null
      ? undefined
      : pct <= bucket.targetPct + 0.5
      ? "green"
      : pct <= bucket.targetPct + 2.5
      ? "amber"
      : "red"

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-base">{bucket.label}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Target {Number(bucket.targetPct).toFixed(0)}% · Forecast{" "}
            {fmt(bucket.forecastRevenue)}
          </p>
        </div>
        <PaceBadge status={bucket.paceStatus} />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Spent to date"
            value={fmt(bucket.spentToDate)}
            sub={`${bucket.invoiceCount} invoices`}
          />
          <Tile
            label="Budget"
            value={fmt(bucket.budget)}
            sub={`@ ${Number(bucket.targetPct).toFixed(0)}% of forecast`}
          />
          <Tile
            label="Remaining"
            value={fmt(bucket.remaining)}
            sub={
              remainPct == null
                ? "—"
                : `${Math.round(remainPct * 100)}% of cap`
            }
            valueTone={
              bucket.remaining == null
                ? undefined
                : bucket.remaining < 0
                ? "red"
                : remainPct != null && remainPct < 0.1
                ? "amber"
                : "green"
            }
          />
          <Tile
            label="Pace projection"
            value={fmt(bucket.projectedEndOfWeek)}
            sub={
              projectedPct == null
                ? bucket.spendProjectionMethod === "weighted"
                  ? "weighted for remaining trading days"
                  : "@ current daily rate"
                : projectedCogsPct == null
                ? `${Math.round(projectedPct * 100)}% of budget`
                : `${Math.round(projectedPct * 100)}% of budget = ${projectedCogsPct.toFixed(1)}% COGS (target ${Number(bucket.targetPct).toFixed(0)}%)`
            }
            valueTone={
              projectedPct == null
                ? undefined
                : projectedPct > 1.05
                ? "red"
                : projectedPct > 0.95
                ? "amber"
                : "green"
            }
          />
        </div>

        {projectedCogsPct != null && (
          <div
            className={cn(
              "rounded-md border px-3 py-2 text-xs",
              cogsTone(liveCogsPct ?? projectedCogsPct) === "red"
                ? "border-red-text/20 bg-red-light text-red-text"
                : cogsTone(liveCogsPct ?? projectedCogsPct) === "amber"
                ? "border-amber-text/20 bg-amber-light text-amber-text"
                : "border-green-text/20 bg-green-light text-green-text"
            )}
          >
            <strong>Where COGS lands:</strong> at this spend pace the week
            finishes at ≈{projectedCogsPct.toFixed(1)}% of{" "}
            <em>forecast</em> revenue (target{" "}
            {Number(bucket.targetPct).toFixed(0)}%).
            {liveCogsPct != null && revenuePaceOfForecast != null && (
              <>
                {" "}
                Actual revenue is pacing at{" "}
                {Math.round(revenuePaceOfForecast)}% of forecast, so against{" "}
                <em>real</em> takings COGS lands at ≈
                <strong>{liveCogsPct.toFixed(1)}%</strong>.
              </>
            )}
          </div>
        )}

        {bucket.estimatedMissingSpend > 0 && (
          <div className="rounded-md border border-amber-text/20 bg-amber-light px-3 py-2 text-xs text-amber-text">
            <strong>+{fmt(bucket.estimatedMissingSpend)} estimated</strong>{" "}
            from suppliers we'd expect this week whose invoices aren't in
            (see Coverage). Folded into the pace projection but NOT into
            "spent to date".
            {bucket.missingSpendBreakdown.length > 0 && (
              <ul className="mt-1.5 space-y-0.5">
                {bucket.missingSpendBreakdown.map((r) => (
                  <li key={r.supplier} className="flex justify-between gap-2">
                    <span>
                      {r.supplier}{" "}
                      <span className="text-amber-text/80">
                        (last invoice{" "}
                        {r.daysSinceLast == null
                          ? "never"
                          : `${r.daysSinceLast}d ago`}
                        )
                      </span>
                    </span>
                    <span className="tabular-nums">
                      ~{fmt(r.estWeekly)}/wk
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Live revenue — Lightspeed EOD reports (ex GST)
            </span>
            {bucket.lastRevenueDate && (
              <span className="text-[10px] text-muted-foreground">
                through {bucket.lastRevenueDate}
              </span>
            )}
          </div>
          {bucket.revenueToDateExGst == null ? (
            <p className="text-xs text-muted-foreground">
              No Lightspeed EOD report received yet this week.
            </p>
          ) : (
            <>
              <div className="mb-2 grid grid-cols-3 gap-3">
                <Tile
                  label="Takings so far"
                  value={fmt(bucket.revenueToDateExGst)}
                  sub={`${bucket.revenueDaysReported} of 7 days reported`}
                />
                <Tile
                  label="Full-week pace"
                  value={fmt(bucket.projectedRevenueExGst)}
                  sub={
                    (revenuePaceOfForecast == null
                      ? "no forecast to compare"
                      : `${Math.round(revenuePaceOfForecast)}% of ${fmt(bucket.forecastRevenue)} forecast`) +
                    (bucket.revenueProjectionMethod === "weighted"
                      ? " · weekday-weighted"
                      : "")
                  }
                  valueTone={
                    revenuePaceOfForecast == null
                      ? undefined
                      : revenuePaceOfForecast >= 100
                      ? "green"
                      : revenuePaceOfForecast >= 90
                      ? "amber"
                      : "red"
                  }
                />
                <Tile
                  label="COGS on real takings"
                  value={
                    liveCogsPct == null ? "—" : `${liveCogsPct.toFixed(1)}%`
                  }
                  sub={`spend pace ÷ revenue pace · target ${Number(bucket.targetPct).toFixed(0)}%`}
                  valueTone={cogsTone(liveCogsPct)}
                />
              </div>
              <div className="overflow-hidden rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30">
                    <tr className="text-left">
                      <th className="px-2 py-1.5 font-medium">Day</th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        Takings
                      </th>
                      <th className="px-2 py-1.5 text-right font-medium">
                        Running total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bucket.revenueDaily.map((d) => (
                      <tr key={d.date} className="border-t border-border">
                        <td className="px-2 py-1.5">
                          {d.dayName}{" "}
                          <span className="text-muted-foreground">
                            {d.date.slice(5)}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {d.reported ? fmt(d.amount) : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {d.reported ? fmt(d.cumulative) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Lightspeed POS only — online orders and event revenue land on
                top of these figures, so true takings read slightly higher.
              </p>
            </>
          )}
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            Daily spend (cumulative, this week)
          </div>
          <div className="h-44 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={bucket.daily}
                margin={{ top: 6, right: 6, left: 6, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="dayName" tick={{ fontSize: 11 }} />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(v, name) => {
                    const num = typeof v === "number" ? v : Number(v ?? 0)
                    return name === "amount"
                      ? [fmt(num), "Spent today"]
                      : [fmt(num), "Cumulative"]
                  }}
                />
                {bucket.budget != null && (
                  <ReferenceLine
                    y={bucket.budget}
                    stroke="#dc2626"
                    strokeDasharray="4 4"
                    label={{
                      value: `Cap ${fmt(bucket.budget)}`,
                      fontSize: 10,
                      fill: "#dc2626",
                      position: "right",
                    }}
                  />
                )}
                <Bar
                  dataKey="cumulative"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-medium text-muted-foreground">
            This week by supplier
          </div>
          {bucket.suppliers.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No invoices yet this week.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted/30">
                  <tr className="text-left">
                    <th className="px-2 py-1.5 font-medium">Supplier</th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      This wk
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      4-wk avg
                    </th>
                    <th className="px-2 py-1.5 text-right font-medium">
                      Δ
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bucket.suppliers.map((s) => {
                    const delta =
                      s.fourWeekAvg == null
                        ? null
                        : s.amount - s.fourWeekAvg
                    return (
                      <tr key={s.supplier} className="border-t border-border">
                        <td className="px-2 py-1.5">{s.supplier}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {fmt(s.amount)}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {fmt(s.fourWeekAvg)}
                        </td>
                        <td
                          className={cn(
                            "px-2 py-1.5 text-right tabular-nums",
                            delta == null
                              ? "text-muted-foreground"
                              : delta > 0
                              ? "text-red-text"
                              : "text-green-text"
                          )}
                        >
                          {delta == null
                            ? "—"
                            : delta > 0
                            ? `+${fmt(delta)}`
                            : fmt(delta)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function Tile({
  label,
  value,
  sub,
  valueTone,
}: {
  label: string
  value: string
  sub?: string
  valueTone?: "green" | "amber" | "red"
}) {
  const toneCls =
    valueTone === "red"
      ? "text-red-text"
      : valueTone === "amber"
      ? "text-amber-text"
      : valueTone === "green"
      ? "text-green-text"
      : "text-foreground"
  return (
    <div className="rounded-xl border-[1.5px] border-border bg-card p-4">
      <div className="font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 font-serif text-2xl font-semibold tabular-nums",
          toneCls
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
      )}
    </div>
  )
}

function CoveragePanel({
  rows,
}: {
  rows: CurrentWeekSpendSnapshot["coverage"]
}) {
  const problems = rows.filter(
    (r) => r.status === "overdue" || r.status === "missing"
  )
  const dueSoon = rows.filter((r) => r.status === "due-soon")
  const ok = rows.filter((r) => r.status === "ok")

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Supplier coverage</CardTitle>
        <p className="text-xs text-muted-foreground">
          Suppliers we expect to receive invoices from at accounts@. Items
          in red haven't invoiced for &gt; 2× their expected cadence — chase
          them to add accounts@tarte.com.au to their billing list.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {problems.length > 0 && (
          <CoverageSection
            title={`Action needed (${problems.length})`}
            rows={problems}
            highlight
          />
        )}
        {dueSoon.length > 0 && (
          <CoverageSection
            title={`Due soon (${dueSoon.length})`}
            rows={dueSoon}
          />
        )}
        {ok.length > 0 && (
          <CoverageSection title={`Healthy (${ok.length})`} rows={ok} muted />
        )}
      </CardContent>
    </Card>
  )
}

function CoverageSection({
  title,
  rows,
  highlight,
  muted,
}: {
  title: string
  rows: CurrentWeekSpendSnapshot["coverage"]
  highlight?: boolean
  muted?: boolean
}) {
  return (
    <div>
      <div
        className={cn(
          "mb-1.5 font-serif text-xs font-semibold uppercase tracking-[0.14em]",
          highlight ? "text-red-text" : muted ? "text-muted-foreground" : ""
        )}
      >
        {title}
      </div>
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-xs">
          <thead className="bg-muted/30">
            <tr className="text-left">
              <th className="px-2 py-1.5 font-medium">Supplier</th>
              <th className="px-2 py-1.5 font-medium">Cat.</th>
              <th className="px-2 py-1.5 font-medium">Last seen</th>
              <th className="px-2 py-1.5 text-right font-medium">
                Days ago
              </th>
              <th className="px-2 py-1.5 text-right font-medium">
                Est. $/wk
              </th>
              <th className="px-2 py-1.5 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.canonicalName} className="border-t border-border">
                <td className="px-2 py-1.5">
                  <div className="font-medium">{r.canonicalName}</div>
                  {r.note && (
                    <div className="text-[10px] text-muted-foreground">
                      {r.note}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {r.category}
                </td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {r.lastInvoiceDate ?? "never"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {r.daysSinceLast ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                  {fmt(r.estimatedWeeklySpend)}
                </td>
                <td className="px-2 py-1.5">
                  <StatusPill status={r.status} critical={r.critical} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function StatusPill({
  status,
  critical,
}: {
  status: CurrentWeekSpendSnapshot["coverage"][number]["status"]
  critical: boolean
}) {
  const map: Record<typeof status, { label: string; cls: string }> = {
    ok: { label: "OK", cls: "border-green-text/30 bg-green-light text-green-text" },
    "due-soon": {
      label: "Due soon",
      cls: "border-amber-text/30 bg-amber-light text-amber-text",
    },
    overdue: {
      label: critical ? "OVERDUE" : "Overdue",
      cls: "border-red-text/30 bg-red-light text-red-text",
    },
    missing: {
      label: critical ? "MISSING" : "Not seen",
      cls: critical
        ? "border-red-text/30 bg-red-light text-red-text"
        : "border-input bg-muted/50 text-foreground",
    },
  }
  const { label, cls } = map[status]
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        cls
      )}
    >
      {label}
    </span>
  )
}

function UnassignedPanel({
  rows,
  onAssigned,
}: {
  rows: CurrentWeekSpendSnapshot["unassigned"]
  onAssigned: () => void
}) {
  const [isPending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)

  if (rows.length === 0) return null

  const handleAssign = (id: string, venue: Venue) => {
    setBusyId(id)
    startTransition(async () => {
      await assignInvoiceVenue({ invoiceId: id, venue })
      setBusyId(null)
      onAssigned()
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-amber-text">
          Unassigned invoices ({rows.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          These invoices came through without a venue tag. Per Chris, no
          shared orders exist — assign each one so it counts toward the
          right bucket.
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-xs">
            <thead className="bg-muted/30">
              <tr className="text-left">
                <th className="px-2 py-1.5 font-medium">Date</th>
                <th className="px-2 py-1.5 font-medium">Supplier</th>
                <th className="px-2 py-1.5 font-medium">Inv #</th>
                <th className="px-2 py-1.5 text-right font-medium">Total</th>
                <th className="px-2 py-1.5 font-medium">Assign to</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-2 py-1.5">{r.invoiceDate ?? "—"}</td>
                  <td className="px-2 py-1.5">{r.supplierName}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">
                    {r.invoiceNumber ?? "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {fmt(r.total)}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex gap-1">
                      {(["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as Venue[]).map(
                        (v) => (
                          <Button
                            key={v}
                            size="sm"
                            variant="outline"
                            disabled={isPending && busyId === r.id}
                            onClick={() => handleAssign(r.id, v)}
                          >
                            {v === "BURLEIGH"
                              ? "Bur"
                              : v === "BEACH_HOUSE"
                              ? "BH"
                              : "TG"}
                          </Button>
                        )
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

export function SpendDashboard({ data }: { data: CurrentWeekSpendSnapshot }) {
  // No router; rely on the Next.js page-level revalidate on re-load.
  const reload = () => {
    if (typeof window !== "undefined") window.location.reload()
  }

  return (
    <div className="space-y-6">
      <div className="rounded-md border border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        Trading week <strong>{data.weekStartWed}</strong> → <strong>{data.weekEndTue}</strong>.{" "}
        Today is day {data.dayOfWeek} of 7 ({data.daysElapsedFull} full days
        elapsed). Projections weight the remaining days by each weekday's
        typical share of the week (last 8 weeks) — a quiet Monday isn't
        assumed to spend or take like a Saturday.
      </div>

      <UnassignedPanel rows={data.unassigned} onAssigned={reload} />

      <div className="grid gap-4 md:grid-cols-2">
        {data.buckets.map((b) => (
          <BucketCard key={b.bucket} bucket={b} />
        ))}
      </div>

      <CoveragePanel rows={data.coverage} />
    </div>
  )
}
