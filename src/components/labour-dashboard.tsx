"use client"

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL, VENUE_CHART_COLOR } from "@/lib/venues"
import type { LabourDashboardData, LabourWeekCard } from "@/lib/actions/labour"

function bandVariant(pct: number | null): "green" | "amber" | "red" | "outline" {
  if (pct === null) return "outline"
  if (pct < 28) return "green"
  if (pct < 34) return "amber"
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
            Past weeks (actuals from payroll)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
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
                <tr
                  key={wk.weekStartWed}
                  className="border-b border-border/50 last:border-0"
                >
                  <td className="py-2.5">{wk.label}</td>
                  {wk.perVenue.map((row) => (
                    <td
                      key={row.venue}
                      className="py-2.5 text-right tabular-nums"
                    >
                      {row.hasActuals ? (
                        <div className="inline-flex flex-col items-end gap-0.5">
                          <span className="text-xs text-muted-foreground">
                            ${Math.round(row.actualWages ?? 0).toLocaleString()}
                          </span>
                          <Badge variant={bandVariant(row.labourPct)} className="text-[10px]">
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
              ))}
            </tbody>
          </table>
          {initial.pastWeeks.every((w) =>
            w.perVenue.every((v) => !v.hasActuals)
          ) && (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              No actuals yet. Upload your bookkeeper&apos;s payroll report to
              fill this in →{" "}
              <a
                href="/labour/upload"
                className="font-medium text-primary hover:underline"
              >
                Upload payroll
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Labour % = gross wages ÷ M. Forecast (ex GST). Band: &lt;28% green,
        28–34% amber, ≥34% red. Actuals come from uploaded payroll reports;
        M. Forecast syncs from Deputy&apos;s Roster Insights hourly.
      </p>
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
