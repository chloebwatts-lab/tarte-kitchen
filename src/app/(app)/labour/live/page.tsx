export const dynamic = "force-dynamic"
export const revalidate = 0

import { getLiveLabourSnapshot } from "@/lib/actions/labour-live"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { BackLink } from "@/components/ui/back-link"
import { cn } from "@/lib/utils"

function fmtMoney(n: number, opts?: { sign?: boolean }) {
  const sign = opts?.sign && n > 0 ? "+" : ""
  return `${sign}$${Math.round(n).toLocaleString("en-AU")}`
}

function fmtPct(n: number | null, opts?: { sign?: boolean; decimals?: number }) {
  if (n == null) return "—"
  const d = opts?.decimals ?? 2
  const sign = opts?.sign && n > 0 ? "+" : ""
  return `${sign}${n.toFixed(d)}%`
}

function statusVariant(s: string): "green" | "amber" | "red" | undefined {
  if (s === "ok") return "green"
  if (s === "amber") return "amber"
  if (s === "red") return "red"
  return undefined
}

export default async function LiveLabourPage() {
  const snap = await getLiveLabourSnapshot()
  const asOf = new Date(snap.venues[0]?.coverage.asOf ?? new Date().toISOString())
  const asOfLocal = asOf.toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  })

  return (
    <div className="space-y-6">
      <BackLink href="/labour" label="Back to labour" />
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Live labour</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Wage % tracking for the current Tarte trading week ({snap.weekLabel}).
          Blends actual clock-ins (so far) with rostered shifts (remaining).
          Refresh for the latest accrual — page rebuilds on every load.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">As of {asOfLocal} AEST</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {snap.venues.map((v) => (
          <Card key={v.venue} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base font-medium">{v.label}</CardTitle>
                <Badge
                  variant={
                    v.overallProjectedPct == null
                      ? undefined
                      : v.overallProjectedPct <= 36
                        ? "green"
                        : v.overallProjectedPct <= 38
                          ? "amber"
                          : "red"
                  }
                >
                  {fmtPct(v.overallProjectedPct)} proj
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {v.coverage.daysLocked} days locked · {v.coverage.daysRemaining} days
                rostered ahead
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Header KPIs */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-muted-foreground">Labour to date</p>
                  <p className="font-serif text-lg font-semibold tabular-nums">
                    {fmtMoney(v.labourToDate)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtMoney(v.labourProjected)} projected EOW
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Revenue to date</p>
                  <p className="font-serif text-lg font-semibold tabular-nums">
                    {fmtMoney(v.revenueToDate)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {fmtMoney(v.revenueProjected)} projected EOW
                  </p>
                </div>
              </div>

              {/* Dept buckets */}
              {v.buckets.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No dept-wage band targets configured for this venue.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Department buckets (projected EOW)
                  </p>
                  {v.buckets.map((b) => (
                    <div
                      key={b.key}
                      className={cn(
                        "rounded-lg border border-border/70 p-2.5",
                        b.status === "red" &&
                          "border-red-text/20 bg-red-light/40",
                        b.status === "amber" &&
                          "border-amber-text/20 bg-amber-light/40",
                        b.status === "ok" &&
                          "border-green-text/20 bg-green-light/40"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{b.label}</span>
                        <Badge variant={statusVariant(b.status)}>
                          {fmtPct(b.projectedPct)}
                        </Badge>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span className="tabular-nums">
                          {fmtMoney(b.spentToDate)} spent · {fmtMoney(b.projectedTotal)} proj
                        </span>
                        <span className="tabular-nums">
                          target {b.target ? `${b.target.min}–${b.target.max}%` : "—"}
                          {b.varianceVsBandPct != null && b.varianceVsBandPct > 0 && (
                            <span className="ml-1 text-red-text">
                              ({fmtPct(b.varianceVsBandPct, { sign: true, decimals: 1 })})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">How this is computed</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>
            Labour <strong>to date</strong>: Deputy <em>Timesheet</em> rows for shifts
            that have started this week. In-progress shifts accrue against
            their clock-in time and refresh on each page load.
          </li>
          <li>
            Labour <strong>projected EOW</strong>: + Deputy <em>Roster</em> cost for
            shifts that haven&apos;t started yet.
          </li>
          <li>
            Revenue <strong>to date</strong>: Lightspeed daily totals for Wed → yesterday +
            today&apos;s API-side running total (synced every 30 min).
          </li>
          <li>
            Revenue <strong>projected EOW</strong>: + manager&apos;s Deputy forecast for
            remaining days, or average of the locked days if no forecast.
          </li>
          <li>
            Dept status: <strong>ok</strong> when projected % ≤ band max,
            <strong> amber</strong> within +0.5pp, <strong>red</strong> beyond.
            Under-band isn&apos;t flagged — that&apos;s a happy underspend.
          </li>
        </ul>
      </div>
    </div>
  )
}
