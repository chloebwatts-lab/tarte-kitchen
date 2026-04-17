"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { TrendingUp } from "lucide-react"
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts"

interface PriceAlert {
  id: string
  invoiceDate: string | null
  supplierName: string
  supplierId: string
  ingredientId: string | null
  ingredientName: string
  unitPrice: number
  unit: string
  previousPrice: number | null
  priceChangeAmount: number | null
  priceChangePercent: number | null
  createdAt: string
}

const COLORS = [
  "#2563eb", "#dc2626", "#16a34a", "#9333ea", "#ea580c",
  "#0891b2", "#4f46e5", "#c026d3",
]

export function SupplierPriceHistory({ alerts }: { alerts: PriceAlert[] }) {
  const [selectedIngredient, setSelectedIngredient] = useState<string>("all")

  // Get unique ingredients that have price data
  const ingredients = useMemo(() => {
    const map = new Map<string, string>()
    for (const a of alerts) {
      if (a.ingredientId) {
        map.set(a.ingredientId, a.ingredientName)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [alerts])

  // Filter data for chart
  const filteredAlerts = useMemo(() => {
    if (selectedIngredient === "all") return alerts
    return alerts.filter((a) => a.ingredientId === selectedIngredient)
  }, [alerts, selectedIngredient])

  // Build chart data — group by date, one series per supplier
  const { chartData, suppliers } = useMemo(() => {
    const supplierSet = new Set<string>()
    const dateMap = new Map<string, Record<string, string | number>>()

    for (const a of filteredAlerts) {
      const date = a.invoiceDate
        ? new Date(a.invoiceDate).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })
        : new Date(a.createdAt).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
          })
      supplierSet.add(a.supplierName)

      const existing = dateMap.get(date) ?? { date }
      existing[a.supplierName] = a.unitPrice
      dateMap.set(date, existing)
    }

    return {
      chartData: Array.from(dateMap.values()),
      suppliers: Array.from(supplierSet),
    }
  }, [filteredAlerts])

  // Supplier comparison table for selected ingredient
  const supplierComparison = useMemo(() => {
    if (selectedIngredient === "all") return []

    const latestBySupplier = new Map<string, PriceAlert>()
    for (const a of filteredAlerts) {
      const existing = latestBySupplier.get(a.supplierId)
      if (!existing || new Date(a.createdAt) > new Date(existing.createdAt)) {
        latestBySupplier.set(a.supplierId, a)
      }
    }

    const entries = Array.from(latestBySupplier.values()).sort(
      (a, b) => a.unitPrice - b.unitPrice
    )

    return entries
  }, [filteredAlerts, selectedIngredient])

  if (alerts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <TrendingUp className="h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            No price history yet. As invoices are processed, price trends will
            appear here.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={selectedIngredient} onValueChange={setSelectedIngredient}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select ingredient..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ingredients</SelectItem>
            {ingredients.map((ing) => (
              <SelectItem key={ing.id} value={ing.id}>
                {ing.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {chartData.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Price Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  className="text-xs"
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `$${v}`}
                />
                <Tooltip
                  formatter={(value) => `$${Number(value).toFixed(2)}`}
                />
                <Legend />
                {suppliers.map((supplier, i) => (
                  <Line
                    key={supplier}
                    type="monotone"
                    dataKey={supplier}
                    stroke={COLORS[i % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Supplier comparison table */}
      {supplierComparison.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Supplier Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {supplierComparison.map((entry, i) => {
                const cheapest = i === 0
                const savings =
                  i > 0
                    ? entry.unitPrice - supplierComparison[0].unitPrice
                    : 0

                return (
                  <div
                    key={entry.supplierId}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      cheapest
                        ? "border-green-200 bg-green-50"
                        : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {entry.supplierName}
                      </span>
                      {cheapest && (
                        <Badge variant="green">Cheapest</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">
                        ${entry.unitPrice.toFixed(2)}/{entry.unit}
                      </span>
                      {savings > 0 && (
                        <p className="text-xs text-red-600">
                          +${savings.toFixed(2)} more
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Raw data table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Price Records</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="text-left py-2 pr-2">Date</th>
                  <th className="text-left py-2 px-2">Ingredient</th>
                  <th className="text-left py-2 px-2">Supplier</th>
                  <th className="text-right py-2 px-2">Price</th>
                  <th className="text-right py-2 pl-2">Change</th>
                </tr>
              </thead>
              <tbody>
                {filteredAlerts.slice(0, 50).map((alert) => (
                  <tr key={alert.id} className="border-b border-border/50">
                    <td className="py-2 pr-2 text-muted-foreground">
                      {alert.invoiceDate
                        ? new Date(alert.invoiceDate).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                    <td className="py-2 px-2">{alert.ingredientName}</td>
                    <td className="py-2 px-2 text-muted-foreground">
                      {alert.supplierName}
                    </td>
                    <td className="text-right py-2 px-2">
                      ${alert.unitPrice.toFixed(2)}/{alert.unit}
                    </td>
                    <td className="text-right py-2 pl-2">
                      {alert.priceChangePercent !== null ? (
                        <span
                          className={
                            (alert.priceChangePercent ?? 0) > 0
                              ? "text-red-600"
                              : "text-green-600"
                          }
                        >
                          {(alert.priceChangePercent ?? 0) > 0 ? "+" : ""}
                          {alert.priceChangePercent?.toFixed(1)}%
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
