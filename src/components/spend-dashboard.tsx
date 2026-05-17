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
      ? "border-green-300 bg-green-50 text-green-800"
      : variant === "amber"
      ? "border-amber-300 bg-amber-50 text-amber-800"
      : variant === "red"
      ? "border-red-300 bg-red-50 text-red-800"
      : "border-gray-300 bg-white text-gray-600"
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
                ? "@ current daily rate"
                : `${Math.round(projectedPct * 100)}% of budget`
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

        {bucket.estimatedMissingSpend > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>+{fmt(bucket.estimatedMissingSpend)} estimated</strong>{" "}
            from suppliers we'd expect this week whose invoices aren't in
            (see Coverage). Folded into the pace projection but NOT into
            "spent to date".
          </div>
        )}

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
                              ? "text-red-700"
                              : "text-green-700"
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
      ? "text-red-700"
      : valueTone === "amber"
      ? "text-amber-700"
      : valueTone === "green"
      ? "text-green-700"
      : "text-foreground"
  return (
    <div className="rounded-md border border-border bg-background p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("mt-1 text-xl font-semibold tabular-nums", toneCls)}>
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>
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
          "mb-1.5 text-xs font-semibold uppercase tracking-wide",
          highlight ? "text-red-700" : muted ? "text-muted-foreground" : ""
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
    ok: { label: "OK", cls: "border-green-300 bg-green-50 text-green-800" },
    "due-soon": {
      label: "Due soon",
      cls: "border-amber-300 bg-amber-50 text-amber-800",
    },
    overdue: {
      label: critical ? "OVERDUE" : "Overdue",
      cls: "border-red-300 bg-red-50 text-red-800",
    },
    missing: {
      label: critical ? "MISSING" : "Not seen",
      cls: critical
        ? "border-red-300 bg-red-50 text-red-800"
        : "border-gray-300 bg-gray-50 text-gray-700",
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
        <CardTitle className="text-base text-amber-900">
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
        elapsed). Pace projection extrapolates the current daily rate to
        end-of-week.
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
