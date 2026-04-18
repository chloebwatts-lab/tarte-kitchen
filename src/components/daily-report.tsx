import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { DailyReport } from "@/lib/actions/daily-report"
import { VENUE_LABEL, VENUE_CHART_COLOR } from "@/lib/venues"

export function DailyReportSection({ data }: { data: DailyReport }) {
  if (!data.date || data.sites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Daily POS Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No Lightspeed end-of-day report ingested yet. The cron runs at
            08:00 AEST each morning.
          </p>
        </CardContent>
      </Card>
    )
  }

  const dateLabel = new Date(data.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Daily POS Report — {dateLabel}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sourced from the Lightspeed end-of-day email. Updated daily at 08:00 AEST.
        </p>
      </div>

      {/* Section 1: Revenue per site */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 font-medium">Site</th>
                <th className="py-2 text-right font-medium">Total Ex Tax</th>
                <th className="py-2 text-right font-medium">Total Inc Tax</th>
              </tr>
            </thead>
            <tbody>
              {data.sites.map((s) => (
                <tr key={s.venue} className="border-b border-border/40 last:border-0">
                  <td className="py-2 font-medium">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: VENUE_CHART_COLOR[s.venue] }}
                    />
                    {VENUE_LABEL[s.venue]}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    ${s.totalExTax.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    ${s.totalIncTax.toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2">Total</td>
                <td className="py-2 text-right tabular-nums">
                  $
                  {data.sites
                    .reduce((s, x) => s + x.totalExTax, 0)
                    .toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </td>
                <td className="py-2 text-right tabular-nums">
                  $
                  {data.sites
                    .reduce((s, x) => s + x.totalIncTax, 0)
                    .toLocaleString("en-AU", { minimumFractionDigits: 2 })}
                </td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Section 2: Reporting Group Sales (category list per site) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Total Reporting Group Sales
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            Categories active across the reporting period.
          </p>
          <div className="flex flex-wrap gap-2">
            {Array.from(
              new Set(
                data.sites.flatMap((s) => s.categories.map((c) => c.categoryName))
              )
            )
              .sort((a, b) => a.localeCompare(b))
              .map((cat) => (
                <span
                  key={cat}
                  className="rounded-full border border-border bg-muted/50 px-3 py-1 text-xs"
                >
                  {cat}
                </span>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Reporting Group Breakdown per site */}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.sites.map((s) => (
          <Card key={s.venue}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm font-medium">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: VENUE_CHART_COLOR[s.venue] }}
                />
                {VENUE_LABEL[s.venue]} — Reporting Group Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {s.categories.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No category data captured.
                </p>
              ) : (
                s.categories.map((cat) => (
                  <div key={cat.categoryName}>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {cat.categoryName}
                    </h3>
                    {cat.topProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">—</p>
                    ) : (
                      <table className="w-full text-sm">
                        <tbody>
                          {cat.topProducts.map((p) => (
                            <tr key={`${cat.categoryName}-${p.rank}-${p.name}`} className="border-b border-border/30 last:border-0">
                              <td className="py-1 pr-2 text-xs text-muted-foreground w-5 tabular-nums">
                                {p.rank}
                              </td>
                              <td className="py-1 pr-2">{p.name}</td>
                              <td className="py-1 text-right tabular-nums text-muted-foreground">
                                {p.quantity}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
