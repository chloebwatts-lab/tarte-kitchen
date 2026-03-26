"use client"

import Link from "next/link"
import {
  UtensilsCrossed,
  ChefHat,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface DashboardStats {
  totalMenuItems: number
  totalPreparations: number
  averageFoodCostPct: number
  itemsAbove35Pct: number
  itemsAbove35: Array<{
    id: string
    name: string
    foodCostPercentage: number
    venue: string
  }>
  topByProfit: Array<{
    id: string
    name: string
    grossProfit: number
    foodCostPercentage: number
  }>
  worstByCost: Array<{
    id: string
    name: string
    foodCostPercentage: number
    totalCost: number
  }>
  alerts: Array<{
    id: string
    ingredientId: string
    ingredientName: string
    oldPrice: number
    newPrice: number
    changePercentage: number
    changedAt: string
  }>
}

function costColor(pct: number) {
  if (pct < 30) return "green" as const
  if (pct <= 35) return "amber" as const
  return "red" as const
}

export function DashboardContent({ stats }: { stats: DashboardStats }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Menu Items</p>
                <p className="text-3xl font-bold">{stats.totalMenuItems}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Preparations</p>
                <p className="text-3xl font-bold">{stats.totalPreparations}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <ChefHat className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Food Cost</p>
                <p className="text-3xl font-bold">
                  <Badge variant={costColor(stats.averageFoodCostPct)} className="text-lg px-3 py-1">
                    {stats.averageFoodCostPct}%
                  </Badge>
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Above 35%</p>
                <p className="text-3xl font-bold">
                  {stats.itemsAbove35Pct > 0 ? (
                    <span className="text-red-600">{stats.itemsAbove35Pct}</span>
                  ) : (
                    <span className="text-green-600">0</span>
                  )}
                </p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <AlertTriangle className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Price Change Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Recent Price Changes</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.alerts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent price changes</p>
            ) : (
              <div className="space-y-3">
                {stats.alerts.slice(0, 8).map((alert) => (
                  <div key={alert.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <Link
                        href={`/ingredients?search=${encodeURIComponent(alert.ingredientName)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {alert.ingredientName}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        ${alert.oldPrice.toFixed(2)} → ${alert.newPrice.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      {alert.changePercentage > 0 ? (
                        <ArrowUpRight className="h-4 w-4 text-red-500" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4 text-green-500" />
                      )}
                      <span
                        className={`text-sm font-medium ${
                          alert.changePercentage > 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {alert.changePercentage > 0 ? "+" : ""}
                        {alert.changePercentage}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Items Above 35% */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Items Above 35% Food Cost</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.itemsAbove35.length === 0 ? (
              <p className="text-sm text-muted-foreground">All items are within target — nice work!</p>
            ) : (
              <div className="space-y-3">
                {stats.itemsAbove35.map((item) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <Link
                        href={`/dishes?search=${encodeURIComponent(item.name)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{item.venue}</p>
                    </div>
                    <Badge variant="red">{item.foodCostPercentage.toFixed(1)}%</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top by Profit */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Top Items by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topByProfit.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add menu items to see profit rankings</p>
            ) : (
              <div className="space-y-3">
                {stats.topByProfit.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {i + 1}
                      </span>
                      <Link
                        href={`/dishes?search=${encodeURIComponent(item.name)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">${item.grossProfit.toFixed(2)}</p>
                      <Badge variant={costColor(item.foodCostPercentage)} className="text-xs">
                        {item.foodCostPercentage.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Worst by Cost */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Highest Food Cost %</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.worstByCost.length === 0 ? (
              <p className="text-sm text-muted-foreground">Add menu items to see cost rankings</p>
            ) : (
              <div className="space-y-3">
                {stats.worstByCost.map((item, i) => (
                  <div key={item.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {i + 1}
                      </span>
                      <Link
                        href={`/dishes?search=${encodeURIComponent(item.name)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {item.name}
                      </Link>
                    </div>
                    <div className="text-right">
                      <Badge variant={costColor(item.foodCostPercentage)}>
                        {item.foodCostPercentage.toFixed(1)}%
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ${item.totalCost.toFixed(2)} cost
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
