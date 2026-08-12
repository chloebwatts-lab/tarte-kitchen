"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type {
  ProfitSensitivityDefaults,
  ScopeDefaults,
  SensitivityScope,
} from "@/lib/actions/profit-sensitivity"

const PRICE_STEPS = [-20, -15, -10, -5, 0, 5, 10, 15, 20]
const VOLUME_STEPS = [30, 25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30]

const aud = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 0,
})

function scopeLabel(scope: SensitivityScope): string {
  return scope === "ALL" ? "All venues" : VENUE_SHORT_LABEL[scope]
}

/**
 * New gross profit after a price change p and volume change v (both
 * fractions), assuming per-unit costs are unchanged by price and scale
 * 1:1 with volume: GP' = (1+v) * ((1+p)*R - C).
 */
function newGp(revenue: number, cogs: number, p: number, v: number): number {
  return (1 + v) * ((1 + p) * revenue - cogs)
}

/** Volume change (fraction) at which a price change p leaves GP flat. */
function breakEvenVolume(revenue: number, cogs: number, p: number): number | null {
  const priced = (1 + p) * revenue - cogs
  if (priced <= 0) return null
  return (revenue - cogs) / priced - 1
}

/** Red → neutral → green backdrop for a GP delta fraction. */
function cellStyle(delta: number): React.CSSProperties {
  const capped = Math.max(-1, Math.min(1, delta))
  const alpha = Math.min(0.55, Math.abs(capped) * 0.9 + (capped === 0 ? 0 : 0.06))
  if (capped > 0) return { backgroundColor: `rgba(22, 163, 74, ${alpha})` }
  if (capped < 0) return { backgroundColor: `rgba(220, 38, 38, ${alpha})` }
  return { backgroundColor: "rgba(100, 116, 139, 0.08)" }
}

function parseAmount(s: string): number | null {
  const n = parseFloat(s.replace(/[^0-9.-]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function ProfitSensitivityCalculator({
  initial,
}: {
  initial: ProfitSensitivityDefaults
}) {
  const scopes = initial.scopes
  const [scope, setScope] = useState<SensitivityScope>(scopes[0].scope)
  const [revenueInput, setRevenueInput] = useState(
    String(scopes[0].annualRevenue)
  )
  const [cogsInput, setCogsInput] = useState(String(scopes[0].annualCogs))

  function selectScope(s: ScopeDefaults) {
    setScope(s.scope)
    setRevenueInput(String(s.annualRevenue))
    setCogsInput(String(s.annualCogs))
  }

  const revenue = parseAmount(revenueInput)
  const cogs = parseAmount(cogsInput)
  const valid = revenue !== null && cogs !== null && revenue > cogs
  const gp = valid ? revenue! - cogs! : null
  const gpPct = valid ? ((revenue! - cogs!) / revenue!) * 100 : null

  const headline = useMemo(() => {
    if (!valid) return null
    const r = revenue!
    const c = cogs!
    const gp0 = r - c
    const upFive = newGp(r, c, 0.05, 0) - gp0
    const be5 = breakEvenVolume(r, c, 0.05)
    const beMinus5 = breakEvenVolume(r, c, -0.05)
    return { upFive, be5, beMinus5 }
  }, [valid, revenue, cogs])

  const activeDefaults = scopes.find((s) => s.scope === scope)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your numbers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {scopes.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {scopes.map((s) => (
                <button
                  key={s.scope}
                  type="button"
                  onClick={() => selectScope(s)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-medium",
                    scope === s.scope
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-white text-foreground hover:bg-muted/50"
                  )}
                >
                  {scopeLabel(s.scope)}
                </button>
              ))}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="ps-revenue">Annual revenue (ex GST)</Label>
              <Input
                id="ps-revenue"
                inputMode="decimal"
                value={revenueInput}
                onChange={(e) => setRevenueInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-cogs">Annual COGS (ex GST)</Label>
              <Input
                id="ps-cogs"
                inputMode="decimal"
                value={cogsInput}
                onChange={(e) => setCogsInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Gross profit</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/30 px-3 text-sm">
                {gp !== null && gpPct !== null
                  ? `${aud.format(gp)} · ${gpPct.toFixed(1)}% GP`
                  : "—"}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {initial.source === "weekly-cogs" && activeDefaults ? (
              <>
                Pre-filled from the weekly COGS uploads: {activeDefaults.weeksOfData}{" "}
                week{activeDefaults.weeksOfData === 1 ? "" : "s"} of data
                {activeDefaults.latestWeek
                  ? ` to w/e ${activeDefaults.latestWeek}`
                  : ""}
                , scaled to 52 weeks. Edit either figure to model something else.
              </>
            ) : (
              <>
                Pre-filled from the FY26 Xero P&amp;L for Tarte Currumbin (total
                income and total cost of sales). Edit either figure to model
                something else.
              </>
            )}
          </p>
        </CardContent>
      </Card>

      {!valid && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Enter an annual revenue and a COGS figure smaller than it to see
            the sensitivity table.
          </CardContent>
        </Card>
      )}

      {valid && headline && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                +5% on prices, volume unchanged
              </p>
              <p className="mt-1 text-2xl font-semibold text-emerald-700">
                +{aud.format(headline.upFive)}/yr
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                extra gross profit, straight to the bottom line while fixed
                costs stay put
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Volume you could lose after +5% prices
              </p>
              <p className="mt-1 text-2xl font-semibold">
                {headline.be5 !== null
                  ? `${Math.abs(headline.be5 * 100).toFixed(1)}%`
                  : "—"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                before gross profit drops below where it is today
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">
                Extra volume a 5% discount needs
              </p>
              <p className="mt-1 text-2xl font-semibold text-red-700">
                {headline.beMinus5 !== null
                  ? `+${(headline.beMinus5 * 100).toFixed(1)}%`
                  : "n/a"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                more sales just to keep gross profit flat
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {valid && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Gross profit impact: price change × volume change
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Each cell is the change in annual gross profit $ if prices move
              by the column and sales volume moves by the row. Assumes ingredient
              costs per item are unchanged by price, and total COGS scales with
              volume.
            </p>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-white p-1.5 text-left font-medium text-muted-foreground">
                      Volume ↓ / Price →
                    </th>
                    {PRICE_STEPS.map((p) => (
                      <th
                        key={p}
                        className={cn(
                          "p-1.5 text-center font-semibold",
                          p === 0 && "bg-muted/40"
                        )}
                      >
                        {p > 0 ? `+${p}%` : `${p}%`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {VOLUME_STEPS.map((v) => (
                    <tr key={v}>
                      <th
                        className={cn(
                          "sticky left-0 bg-white p-1.5 text-left font-semibold",
                          v === 0 && "bg-muted/40"
                        )}
                      >
                        {v > 0 ? `+${v}%` : `${v}%`}
                      </th>
                      {PRICE_STEPS.map((p) => {
                        const gp0 = revenue! - cogs!
                        const gp1 = newGp(revenue!, cogs!, p / 100, v / 100)
                        const delta = gp1 / gp0 - 1
                        return (
                          <td
                            key={p}
                            style={cellStyle(delta)}
                            title={`Price ${p > 0 ? "+" : ""}${p}%, volume ${
                              v > 0 ? "+" : ""
                            }${v}%: GP ${aud.format(gp1)} (${
                              delta >= 0 ? "+" : ""
                            }${aud.format(gp1 - gp0)})`}
                            className={cn(
                              "whitespace-nowrap p-1.5 text-center tabular-nums",
                              p === 0 && v === 0 && "font-bold ring-1 ring-inset ring-foreground/40"
                            )}
                          >
                            {delta >= 0 ? "+" : ""}
                            {(delta * 100).toFixed(0)}%
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                  <tr className="border-t border-border">
                    <th className="sticky left-0 bg-white p-1.5 text-left font-medium text-muted-foreground">
                      Break-even volume
                    </th>
                    {PRICE_STEPS.map((p) => {
                      const be = breakEvenVolume(revenue!, cogs!, p / 100)
                      return (
                        <td
                          key={p}
                          className="whitespace-nowrap p-1.5 text-center font-medium tabular-nums text-muted-foreground"
                        >
                          {be === null
                            ? "never"
                            : `${be >= 0 ? "+" : ""}${(be * 100).toFixed(1)}%`}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              The break-even row is the volume change at which each price move
              leaves gross profit exactly where it is today — anything above
              that row&apos;s value and the price move made you money. Labour,
              rent and other fixed costs are outside this table: a change in
              gross profit here lands (roughly) dollar-for-dollar on net
              profit until the roster or footprint changes.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
