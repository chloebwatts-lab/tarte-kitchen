"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL, VENUE_LABEL, VENUE_CHART_COLOR } from "@/lib/venues"
import type { LabourDashboardData, LabourWeekCard } from "@/lib/actions/labour"

// Wage % of revenue. Targets shared by Chris 2026-04-21: <37% green
// (dream week, hard to hit), 37–40% amber (on-track / normal), >40%
// red (week is off).
function bandVariant(pct: number | null): "green" | "amber" | "red" | "outline" {
  if (pct === null) return "outline"
  if (pct < 37) return "green"
  if (pct <= 40) return "amber"
  return "red"
}

// COGS % of revenue: <28% green, 28–32% amber, ≥32% red.
function cogsBandVariant(pct: number | null): "green" | "amber" | "red" | "outline" {
  if (pct === null) return "outline"
  if (pct < 28) return "green"
  if (pct < 32) return "amber"
  return "red"
}

export function LabourDashboard({ initial }: { initial: LabourDashboardData }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <WeekCard card={initial.liveWeek} heading="This week (live)" />
        <WeekCard card={initial.nextWeek} heading="Next week (forecast)" />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Past weeks (actuals from payroll / Mge PDF)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 w-8"></th>
                <th className="py-2">Week</th>
                {["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"].map((v) => (
                  <th key={v} className="py-2 text-right">
                    {VENUE_SHORT_LABEL[v as keyof typeof VENUE_SHORT_LABEL] ?? v}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {initial.pastWeeks.map((wk) => (
                <PastWeekRow key={wk.weekStartWed} wk={wk} />
              ))}
            </tbody>
          </table>
          {initial.pastWeeks.every((w) =>
            w.perVenue.every((v) => !v.hasActuals)
          ) && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              No actuals yet. Upload your weekly Mge PDF to fill this in →{" "}
              <a
                href="/labour/upload"
                className="font-medium text-primary hover:underline"
              >
                Upload Mge PDF
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Labour % = wages ÷ revenue. Past weeks: wages prefer the Mge
        PDF&apos;s &ldquo;Total less Admin&rdquo; line (apples-to-apples with
        Deputy&apos;s rostered cost); denominator prefers actual revenue ex
        GST from the Mge PDF, then POS, then manager forecast. Bands:
        &lt;28% green, 28–34% amber, ≥34% red.
      </p>
    </div>
  )
}

function PastWeekRow({ wk }: { wk: LabourWeekCard }) {
  const [open, setOpen] = useState(false)
  const hasAnyRich = wk.perVenue.some(
    (v) =>
      v.wagesBarista !== null ||
      v.actualCogs !== null ||
      v.actualRevenueExGst !== null
  )
  const hasAnyActuals = wk.perVenue.some((v) => v.hasActuals)
  return (
    <>
      <tr
        className={cn(
          "border-b border-border/50 last:border-0",
          hasAnyRich && "cursor-pointer hover:bg-muted/30"
        )}
        onClick={() => hasAnyRich && setOpen((o) => !o)}
      >
        <td className="py-2.5 text-muted-foreground">
          {hasAnyRich &&
            (open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            ))}
        </td>
        <td className="py-2.5">{wk.label}</td>
        {wk.perVenue.map((row) => (
          <td key={row.venue} className="py-2.5 text-right tabular-nums">
            {row.hasActuals ? (
              <div className="inline-flex flex-col items-end gap-0.5">
                <span className="text-xs text-muted-foreground">
                  $
                  {Math.round(
                    row.actualWagesExAdmin ?? row.actualWages ?? 0
                  ).toLocaleString()}
                </span>
                <Badge
                  variant={bandVariant(row.labourPct)}
                  className="text-[10px]"
                >
                  {row.labourPct !== null
                    ? `${row.labourPct.toFixed(1)}%`
                    : "—"}
                </Badge>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                — not uploaded —
              </span>
            )}
          </td>
        ))}
      </tr>
      {open && hasAnyRich && (
        <tr className="border-b border-border/50 bg-muted/10">
          <td></td>
          <td colSpan={4} className="py-3 pr-2">
            <div className="grid gap-3 sm:grid-cols-3">
              {wk.perVenue
                .filter((v) => v.hasActuals)
                .map((v) => (
                  <VenueDetailCard key={v.venue} row={v} />
                ))}
            </div>
          </td>
        </tr>
      )}
      {!hasAnyActuals && null}
    </>
  )
}

function VenueDetailCard({
  row,
}: {
  row: LabourWeekCard["perVenue"][number]
}) {
  const cogsVariance =
    row.actualCogs !== null && row.theoreticalCogs !== null
      ? row.actualCogs - row.theoreticalCogs
      : null
  const revenueVariance =
    row.actualRevenueExGst !== null && row.mForecast !== null
      ? row.actualRevenueExGst - row.mForecast
      : null
  const depts: { label: string; value: number | null }[] = [
    { label: "Barista", value: row.wagesBarista },
    { label: "Chef", value: row.wagesChef },
    { label: "FOH", value: row.wagesFoh },
    { label: "KP/Dishy", value: row.wagesKp },
    { label: "Pastry", value: row.wagesPastry },
    { label: "Admin", value: row.wagesAdmin },
  ]
  const hasDepts = depts.some((d) => d.value !== null)
  return (
    <div className="rounded-md border border-border bg-background p-3 text-xs">
      <div
        className="mb-2 font-medium"
        style={{ color: VENUE_CHART_COLOR[row.venue] }}
      >
        {VENUE_LABEL[row.venue]}
      </div>

      <div className="space-y-1.5">
        <Row
          label="Revenue ex GST"
          value={row.actualRevenueExGst}
          variance={revenueVariance}
          varianceLabel="vs M. forecast"
        />
        <Row label="Wages (total)" value={row.actualWages} />
        {row.actualWagesLessLeaveBackpay !== null && (
          <Row
            label="Wages ex-leave/toil/bkpay"
            value={row.actualWagesLessLeaveBackpay}
            muted
          />
        )}
        <Row label="Wages ex-admin" value={row.actualWagesExAdmin} />
        {row.actualWagesExAdminLeaveBackpay !== null && (
          <Row
            label="Wages ex-admin/leave/bkpay"
            value={row.actualWagesExAdminLeaveBackpay}
            muted
          />
        )}
        {row.actualCogs !== null && (
          <Row
            label="COGS (actual)"
            value={row.actualCogs}
            pct={row.actualCogsPct}
            pctVariant={cogsBandVariant(row.actualCogsPct)}
          />
        )}
        {row.theoreticalCogs !== null && (
          <Row
            label="COGS (theoretical)"
            value={row.theoreticalCogs}
            pct={row.theoreticalCogsPct}
            variance={cogsVariance}
            varianceLabel="actual−theoretical"
            muted
          />
        )}
      </div>

      {hasDepts && (
        <>
          <div className="mt-2 mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Departments
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {depts.map((d) =>
              d.value === null ? null : (
                <div
                  key={d.label}
                  className="flex items-center justify-between text-[11px]"
                >
                  <span className="text-muted-foreground">{d.label}</span>
                  <span className="tabular-nums">
                    ${Math.round(d.value).toLocaleString()}
                    {row.actualRevenueExGst &&
                      row.actualRevenueExGst > 0 && (
                        <span className="ml-1 text-[10px] text-muted-foreground/70">
                          {(
                            (d.value / row.actualRevenueExGst) *
                            100
                          ).toFixed(1)}
                          %
                        </span>
                      )}
                  </span>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  pct,
  pctVariant,
  variance,
  varianceLabel,
  muted,
}: {
  label: string
  value: number | null
  pct?: number | null
  pctVariant?: "green" | "amber" | "red" | "outline"
  variance?: number | null
  varianceLabel?: string
  muted?: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between text-[11px]",
        muted && "text-muted-foreground"
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5 tabular-nums">
        <span>
          {value !== null ? `$${Math.round(value).toLocaleString()}` : "—"}
        </span>
        {pct !== null && pct !== undefined && (
          <Badge
            variant={pctVariant ?? "outline"}
            className="text-[9px] px-1 py-0"
          >
            {pct.toFixed(1)}%
          </Badge>
        )}
        {variance !== null && variance !== undefined && (
          <span
            className={cn(
              "text-[10px]",
              variance > 0 ? "text-red-600" : "text-emerald-600"
            )}
            title={varianceLabel}
          >
            {variance > 0 ? "+" : ""}
            ${Math.round(variance).toLocaleString()}
          </span>
        )}
      </div>
    </div>
  )
}

function WeekCard({
  card,
  heading,
}: {
  card: LabourWeekCard
  heading: string
}) {
  const orgWages = card.perVenue.reduce(
    (s, v) => s + (v.scheduledWages ?? v.actualWages ?? 0),
    0
  )
  const orgForecast = card.perVenue.reduce(
    (s, v) => s + (v.mForecast ?? 0),
    0
  )
  const orgPct =
    orgForecast > 0
      ? Math.round((orgWages / orgForecast) * 10000) / 100
      : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {heading}
            </p>
            <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
          </div>
          {orgPct !== null ? (
            <Badge variant={bandVariant(orgPct)} className="px-2 py-0.5 text-sm">
              {orgPct.toFixed(1)}%
            </Badge>
          ) : (
            <Badge variant="outline" className="text-xs">
              No forecast
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {card.perVenue.map((v) => {
            const wages = v.scheduledWages ?? v.actualWages ?? 0
            const forecast = v.mForecast ?? 0
            const pct = v.labourPct
            const pctWidth = Math.min(Math.max(pct ?? 0, 0), 60) / 60 * 100
            return (
              <div key={v.venue} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span
                    className="font-medium"
                    style={{ color: VENUE_CHART_COLOR[v.venue] }}
                  >
                    {VENUE_SHORT_LABEL[v.venue]}
                  </span>
                  <div className="flex items-center gap-2 tabular-nums">
                    <span>
                      ${Math.round(wages).toLocaleString()} ÷ $
                      {Math.round(forecast).toLocaleString()}
                    </span>
                    {pct !== null ? (
                      <Badge variant={bandVariant(pct)} className="text-[10px]">
                        {pct.toFixed(1)}%
                      </Badge>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">
                        missing forecast
                      </span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className={cn(
                      "h-full",
                      pct === null
                        ? "bg-gray-300"
                        : pct < 28
                          ? "bg-emerald-500"
                          : pct < 34
                            ? "bg-amber-500"
                            : "bg-red-500"
                    )}
                    style={{ width: `${pctWidth}%` }}
                  />
                </div>
                {(v.scheduledHours ?? v.actualHours) !== null && (
                  <div className="text-[10px] text-muted-foreground tabular-nums">
                    {Math.round(v.scheduledHours ?? v.actualHours ?? 0)} hours
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
