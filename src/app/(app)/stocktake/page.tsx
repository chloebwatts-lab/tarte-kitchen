export const dynamic = "force-dynamic"

import Link from "next/link"
import { Plus, ArrowUpRight, ArrowDownRight, CheckCircle2, Clock } from "lucide-react"
import { listStocktakes } from "@/lib/actions/stocktake"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import { NewStocktakeButton } from "@/components/new-stocktake-button"

export default async function StocktakePage() {
  const rows = await listStocktakes()
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Stocktake</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Count inventory to reconcile against theoretical usage — surfaces
            shrinkage, over-portioning, and untracked waste.
          </p>
        </div>
        <NewStocktakeButton />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No stocktakes yet. Start one to benchmark your inventory.
            </p>
            <div className="mt-4">
              <NewStocktakeButton />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const neg = r.negativeVarianceValue
            return (
              <Link
                key={r.id}
                href={`/stocktake/${r.id}`}
                className="block rounded-md border border-border p-4 hover:bg-muted/40"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {new Date(r.date).toLocaleDateString("en-AU", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <Badge variant="outline">
                        {VENUE_SHORT_LABEL[r.venue] ?? r.venue}
                      </Badge>
                      {r.status === "SUBMITTED" ? (
                        <Badge variant="green" className="gap-1 text-[10px]">
                          <CheckCircle2 className="h-3 w-3" /> Submitted
                        </Badge>
                      ) : (
                        <Badge variant="amber" className="gap-1 text-[10px]">
                          <Clock className="h-3 w-3" /> Draft
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {r.lineCount} item{r.lineCount === 1 ? "" : "s"} counted
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="tabular-nums font-medium">
                      ${r.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </div>
                    {neg < 0 && (
                      <div className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-red-600">
                        <ArrowDownRight className="h-3 w-3" />
                        Shrinkage ${Math.abs(neg).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
