"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  ArrowUpRight,
  ArrowDownRight,
  Check,
  X,
  Leaf,
  Package,
  RefreshCw,
} from "lucide-react"
import {
  acceptAlert,
  dismissAlert,
  recomputeAllAlerts,
} from "@/lib/actions/price-alerts"

interface AlertRow {
  id: string
  ingredientId: string
  ingredientName: string
  category: string
  stream: "PRODUCE" | "STABLE"
  currentPrice: number
  currentUnit: string
  priorPrice: number
  priorPeriodMedian: number | null
  changePct: number
  supplierName: string | null
  lastSeenAt: string
}

interface Props {
  alerts: AlertRow[]
}

export function PriceAlertsV2({ alerts }: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<"PRODUCE" | "STABLE">("STABLE")
  const [acting, setActing] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const produce = alerts.filter((a) => a.stream === "PRODUCE")
  const stable = alerts.filter((a) => a.stream === "STABLE")
  const visible = activeTab === "PRODUCE" ? produce : stable

  const handle = (id: string, action: "accept" | "dismiss") => {
    setActing(id)
    startTransition(async () => {
      if (action === "accept") await acceptAlert(id)
      else await dismissAlert(id)
      setActing(null)
      router.refresh()
    })
  }

  const handleRecompute = () => {
    startTransition(async () => {
      await recomputeAllAlerts()
      router.refresh()
    })
  }

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          No open price alerts. Last computed run found nothing flag-worthy.
          <div className="mt-3">
            <Button variant="outline" size="sm" onClick={handleRecompute}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Recompute from invoices
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("STABLE")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
              activeTab === "STABLE"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Package className="h-3.5 w-3.5" />
            Pantry &amp; stable ({stable.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("PRODUCE")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
              activeTab === "PRODUCE"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            <Leaf className="h-3.5 w-3.5" />
            Fruit &amp; veg ({produce.length})
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={handleRecompute}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Recompute
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {visible.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No {activeTab === "PRODUCE" ? "produce" : "stable"} alerts open.
            </div>
          ) : (
            <ul className="divide-y">
              {visible.map((a) => {
                const up = a.changePct > 0
                const Icon = up ? ArrowUpRight : ArrowDownRight
                const isProduce = a.stream === "PRODUCE"
                return (
                  <li
                    key={a.id}
                    className="p-3 flex items-center gap-3 hover:bg-muted/30"
                  >
                    <Icon
                      className={`h-5 w-5 shrink-0 ${
                        up ? "text-red-text" : "text-green-text"
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm truncate">
                          {a.ingredientName}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {a.category}
                        </Badge>
                        {a.supplierName && (
                          <span className="text-xs text-muted-foreground">
                            via {a.supplierName}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                        ${a.priorPrice.toFixed(4)}/{a.currentUnit}
                        {isProduce && a.priorPeriodMedian !== null && (
                          <span className="text-muted-foreground/70">
                            {" "}
                            (4-wk median)
                          </span>
                        )}
                        {" → "}
                        <span
                          className={`font-medium ${
                            up ? "text-red-text" : "text-green-text"
                          }`}
                        >
                          ${a.currentPrice.toFixed(4)}/{a.currentUnit}
                        </span>
                        <span
                          className={`ml-2 ${
                            up ? "text-red-text" : "text-green-text"
                          }`}
                        >
                          {a.changePct > 0 ? "+" : ""}
                          {a.changePct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="default"
                        disabled={acting === a.id}
                        onClick={() => handle(a.id, "accept")}
                      >
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={acting === a.id}
                        onClick={() => handle(a.id, "dismiss")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {activeTab === "PRODUCE" && (
        <p className="text-xs text-muted-foreground">
          Produce alerts compare against a 4-week trailing median and require
          the spike to confirm across 2 deliveries before firing. Single-week
          market moves are suppressed by design.
        </p>
      )}
      {activeTab === "STABLE" && (
        <p className="text-xs text-muted-foreground">
          Stable alerts fire on any ±5% movement vs Ingredient.purchasePrice.
          Bidfood rebate drops surface here too — not just price rises.
        </p>
      )}
    </div>
  )
}
