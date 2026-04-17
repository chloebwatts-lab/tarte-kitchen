"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import {
  UtensilsCrossed,
  ChefHat,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Filter,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface DashboardDish {
  id: string
  name: string
  menuCategory: string
  venue: string
  sellingPrice: number
  totalCost: number
  foodCostPercentage: number
  grossProfit: number
}

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
  allDishes: DashboardDish[]
  alerts: Array<{
    id: string
    ingredientId: string
    ingredientName: string
    oldPrice: number
    newPrice: number
    changePercentage: number
    changedAt: string
  }>
  invoiceAlertCount: number
  recentInvoices: Array<{
    id: string
    supplierName: string
    invoiceNumber: string | null
    totalAmount: number | null
    status: string
    createdAt: string
  }>
}

type CostStatus = "ALL" | "GREEN" | "AMBER" | "RED"

function costColor(pct: number) {
  if (pct < 30) return "green" as const
  if (pct <= 35) return "amber" as const
  return "red" as const
}

export function DashboardContent({ stats }: { stats: DashboardStats }) {
  const [costStatus, setCostStatus] = useState<CostStatus>("ALL")
  const [dashVenue, setDashVenue] = useState("ALL")
  const [dashCategory, setDashCategory] = useState("ALL")

  const filteredDishes = useMemo(() => {
    let result = stats.allDishes ?? []

    if (costStatus !== "ALL") {
      result = result.filter((d) => {
        const status = costColor(d.foodCostPercentage)
        return status === costStatus.toLowerCase()
      })
    }

    if (dashVenue !== "ALL") {
      result = result.filter((d) => d.venue === dashVenue || d.venue === "BOTH")
    }

    if (dashCategory !== "ALL") {
      result = result.filter((d) => d.menuCategory === dashCategory)
    }

    return result.sort((a, b) => b.foodCostPercentage - a.foodCostPercentage)
  }, [stats.allDishes, costStatus, dashVenue, dashCategory])

  const statusCounts = useMemo(() => {
    const all = stats.allDishes ?? []
    return {
      ALL: all.length,
      GREEN: all.filter((d) => d.foodCostPercentage < 30).length,
      AMBER: all.filter((d) => d.foodCostPercentage >= 30 && d.foodCostPercentage <= 35).length,
      RED: all.filter((d) => d.foodCostPercentage > 35).length,
    }
  }, [stats.allDishes])

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

      {/* Invoice Alerts Banner */}
      {stats.invoiceAlertCount > 0 && (
        <Link href="/suppliers">
          <Card className="border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-100 p-3">
                  <FileText className="h-5 w-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-medium text-amber-800">
                    {stats.invoiceAlertCount} invoice price change{stats.invoiceAlertCount !== 1 ? "s" : ""} need review
                  </p>
                  <p className="text-sm text-amber-600">
                    Click to review in Suppliers dashboard
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

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

      {/* Filterable Menu Items */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base font-medium">Menu Items by FC% Status</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dashVenue} onValueChange={setDashVenue}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Venues</SelectItem>
                  <SelectItem value="BURLEIGH">Tarte Bakery (Burleigh)</SelectItem>
                  <SelectItem value="BEACH_HOUSE">Tarte Beach House</SelectItem>
                  <SelectItem value="TEA_GARDEN">Tarte Tea Garden</SelectItem>
                  <SelectItem value="BOTH">Both</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dashCategory} onValueChange={setDashCategory}>
                <SelectTrigger className="h-8 w-[130px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Categories</SelectItem>
                  <SelectItem value="BREAKFAST">Breakfast</SelectItem>
                  <SelectItem value="LUNCH">Lunch</SelectItem>
                  <SelectItem value="SIDES">Sides</SelectItem>
                  <SelectItem value="DRINKS">Drinks</SelectItem>
                  <SelectItem value="KIDS">Kids</SelectItem>
                  <SelectItem value="DESSERT">Dessert</SelectItem>
                  <SelectItem value="PASTRY">Pastry</SelectItem>
                  <SelectItem value="SPECIAL">Special</SelectItem>
                  <SelectItem value="OTHER">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Tabs value={costStatus} onValueChange={(v) => setCostStatus(v as CostStatus)}>
            <TabsList className="mt-2">
              <TabsTrigger value="ALL" className="text-xs gap-1">
                All <span className="text-muted-foreground">({statusCounts.ALL})</span>
              </TabsTrigger>
              <TabsTrigger value="GREEN" className="text-xs gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Green <span className="text-muted-foreground">({statusCounts.GREEN})</span>
              </TabsTrigger>
              <TabsTrigger value="AMBER" className="text-xs gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                Amber <span className="text-muted-foreground">({statusCounts.AMBER})</span>
              </TabsTrigger>
              <TabsTrigger value="RED" className="text-xs gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                Red <span className="text-muted-foreground">({statusCounts.RED})</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {filteredDishes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No dishes match the selected filters</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto">
              {filteredDishes.map((dish) => (
                <div key={dish.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dishes?search=${encodeURIComponent(dish.name)}`}
                      className="text-sm font-medium hover:underline truncate block"
                    >
                      {dish.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">{dish.venue}</span>
                      <span className="text-[10px] text-muted-foreground">{dish.menuCategory}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">${dish.totalCost.toFixed(2)} / ${dish.sellingPrice.toFixed(2)}</p>
                      <p className="text-xs font-medium text-green-700 dark:text-green-400">
                        GP ${dish.grossProfit.toFixed(2)}
                      </p>
                    </div>
                    <Badge variant={costColor(dish.foodCostPercentage)} className="min-w-[52px] justify-center">
                      {dish.foodCostPercentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
