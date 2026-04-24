"use client"

import { useEffect, useState } from "react"
import { AlertTriangle, TrendingUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import {
  getSupplierVariance,
  type SupplierVarianceSummary,
} from "@/lib/actions/supplier-variance"

export function SupplierVariancePanel() {
  const [data, setData] = useState<SupplierVarianceSummary | null>(null)
  const [weeks, setWeeks] = useState(4)

  useEffect(() => {
    let alive = true
    setData(null)
    getSupplierVariance({ weeks }).then((d) => {
      if (alive) setData(d)
    })
    return () => {
      alive = false
    }
  }, [weeks])

  if (!data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading supplier variance…
        </CardContent>
      </Card>
    )
  }

  const hasForms = data.suppliersWithoutForms.length < 3 || data.rows.length > 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 gap-4">
        <div>
          <CardTitle className="text-base font-semibold">
            Supplier variance
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Wrong-supplier buys + price creep vs approved order forms ({data.ranges.since}{" "}
            → {data.ranges.until})
          </p>
        </div>
        <div className="flex gap-1 text-xs">
          {[2, 4, 8].map((w) => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={`rounded border px-2 py-1 ${
                weeks === w
                  ? "bg-primary text-primary-foreground"
                  : "bg-background hover:bg-muted"
              }`}
            >
              {w}w
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasForms ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" /> Variance not yet active — no
              approved order forms
            </div>
            <p className="mt-1 text-xs">
              Variance compares each invoice line against the locked-in price
              on the supplier&apos;s approved order form. Paste the Bidfood,
              Provedores and Fermex forms on{" "}
              <a className="underline font-medium" href="/suppliers">
                Suppliers → Order Forms
              </a>{" "}
              to switch this on. Until then invoices aren&apos;t checked for
              price creep or wrong-supplier buys.
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Total overspend"
                value={`$${data.totalOverspend.toFixed(2)}`}
                tone={data.totalOverspend > 100 ? "red" : "amber"}
              />
              <StatCard label="Flagged lines" value={String(data.rows.length)} tone="outline" />
              <StatCard
                label="Per venue"
                value={
                  data.byVenue.length === 0
                    ? "—"
                    : data.byVenue
                        .map(
                          (v) =>
                            `${VENUE_SHORT_LABEL[v.venue]}: $${v.overspend.toFixed(0)}`
                        )
                        .join("  •  ")
                }
                tone="outline"
              />
            </div>

            {data.suppliersWithoutForms.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <strong>Missing forms:</strong>{" "}
                {data.suppliersWithoutForms.join(", ")} — invoices from these
                suppliers aren&apos;t checked.
              </div>
            )}

            {data.rows.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No supplier variance in this window. 🎉
              </p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Date</th>
                      <th className="px-3 py-2 text-left font-medium">Venue</th>
                      <th className="px-3 py-2 text-left font-medium">Bought from</th>
                      <th className="px-3 py-2 text-left font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Paid</th>
                      <th className="px-3 py-2 text-left font-medium">Should be</th>
                      <th className="px-3 py-2 text-right font-medium">Form $</th>
                      <th className="px-3 py-2 text-right font-medium">Overspend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(0, 40).map((r, i) => (
                      <tr key={`${r.invoiceId}-${i}`} className="border-b last:border-0">
                        <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                          {r.invoiceDate ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          {r.venue ? VENUE_SHORT_LABEL[r.venue] : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant={r.onOwnForm ? "amber" : "red"}>
                            {r.supplierName}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 max-w-[280px] truncate" title={r.description}>
                          {r.description}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.quantity}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          ${r.unitPrice.toFixed(2)}
                        </td>
                        <td className="px-3 py-2">
                          {r.correctSupplier === r.supplierName ? (
                            <span className="flex items-center gap-1 text-xs text-amber-700">
                              <TrendingUp className="h-3 w-3" /> price creep
                            </span>
                          ) : (
                            <Badge variant="green">{r.correctSupplier}</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.correctPackPrice !== null
                            ? `$${r.correctPackPrice.toFixed(2)}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {r.overspend === null ? "—" : `$${r.overspend.toFixed(2)}`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.rows.length > 40 && (
                  <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                    Showing top 40 of {data.rows.length} flagged lines.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "red" | "amber" | "outline"
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50"
        : "border-muted bg-muted/30"
  return (
    <div className={`rounded-md border p-3 ${toneClass}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  )
}
