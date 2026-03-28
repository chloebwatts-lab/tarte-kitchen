"use client"

import { useState, useMemo } from "react"
import { Search, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DishForm } from "@/components/dish-form"
import { cn } from "@/lib/utils"

// ---------- Types ----------

type DishComponent = {
  id: string
  ingredientId: string | null
  ingredient: {
    id: string
    name: string
    category: string
    baseUnitType: string
    purchasePrice: number
    baseUnitsPerPurchase: number
    wastePercentage: number
  } | null
  preparationId: string | null
  preparation: {
    id: string
    name: string
    category: string
    batchCost: number
    yieldQuantity: number
    yieldUnit: string
    yieldWeightGrams: number
  } | null
  quantity: number
  unit: string
  lineCost: number
  sortOrder: number
}

type Dish = {
  id: string
  name: string
  menuCategory: string
  venue: string
  sellingPrice: number
  sellingPriceExGst: number
  totalCost: number
  foodCostPercentage: number
  grossProfit: number
  popularity: number
  notes: string | null
  isActive: boolean
  components: DishComponent[]
}

const MENU_CATEGORIES = [
  "ALL",
  "BREAKFAST",
  "LUNCH",
  "SIDES",
  "DRINKS",
  "KIDS",
  "DESSERT",
  "PASTRY",
  "SPECIAL",
  "OTHER",
] as const

const MENU_CATEGORY_LABELS: Record<string, string> = {
  ALL: "All",
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  SIDES: "Sides",
  DRINKS: "Drinks",
  KIDS: "Kids",
  DESSERT: "Dessert",
  PASTRY: "Pastry",
  SPECIAL: "Special",
  OTHER: "Other",
}

const VENUE_LABELS: Record<string, string> = {
  ALL: "All Venues",
  BURLEIGH: "Burleigh",
  CURRUMBIN: "Currumbin",
  BOTH: "Both",
}

const VENUE_BADGE: Record<string, { label: string; className: string }> = {
  BURLEIGH: {
    label: "Burleigh",
    className: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  },
  CURRUMBIN: {
    label: "Currumbin",
    className: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300",
  },
  BOTH: {
    label: "Both",
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
}

type SortKey = "name" | "foodCostPercentage" | "grossProfit" | "sellingPrice"
type SortDir = "asc" | "desc"

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function getCostBadge(pct: number): { variant: "green" | "amber" | "red"; label: string } {
  if (pct < 30) return { variant: "green", label: `${pct.toFixed(1)}%` }
  if (pct <= 35) return { variant: "amber", label: `${pct.toFixed(1)}%` }
  return { variant: "red", label: `${pct.toFixed(1)}%` }
}

// ---------- Component ----------

interface DishesTableProps {
  dishes: Dish[]
  initialSearch: string
  initialCategory: string
  initialVenue: string
}

export function DishesTable({
  dishes,
  initialSearch,
  initialCategory,
  initialVenue,
}: DishesTableProps) {
  const [search, setSearch] = useState(initialSearch)
  const [category, setCategory] = useState(initialCategory)
  const [venue, setVenue] = useState(initialVenue)
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortDir, setSortDir] = useState<SortDir>("asc")
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingDish, setEditingDish] = useState<Dish | null>(null)

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir("asc")
    }
  }

  const filtered = useMemo(() => {
    let result = dishes

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((d) => d.name.toLowerCase().includes(q))
    }

    if (category !== "ALL") {
      result = result.filter((d) => d.menuCategory === category)
    }

    if (venue !== "ALL") {
      result = result.filter((d) => d.venue === venue || d.venue === "BOTH")
    }

    result = [...result].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name)
          break
        case "foodCostPercentage":
          cmp = a.foodCostPercentage - b.foodCostPercentage
          break
        case "grossProfit":
          cmp = a.grossProfit - b.grossProfit
          break
        case "sellingPrice":
          cmp = a.sellingPrice - b.sellingPrice
          break
      }
      return sortDir === "asc" ? cmp : -cmp
    })

    return result
  }, [dishes, search, category, venue, sortKey, sortDir])

  const SortButton = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      type="button"
      className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      onClick={() => toggleSort(field)}
    >
      {label}
      {sortKey === field ? (
        sortDir === "asc" ? (
          <ChevronUp className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  )

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search menu items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={venue} onValueChange={setVenue}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Venues</SelectItem>
            <SelectItem value="BURLEIGH">Burleigh</SelectItem>
            <SelectItem value="CURRUMBIN">Currumbin</SelectItem>
            <SelectItem value="BOTH">Both</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category tabs */}
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          {MENU_CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="text-xs">
              {MENU_CATEGORY_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="text-sm text-muted-foreground">No menu items found</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          {/* Header */}
          <div className="hidden border-b border-border bg-muted/50 px-4 py-3 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4">
            <div className="col-span-4">
              <SortButton label="Dish" field="name" />
            </div>
            <div className="col-span-1 text-center">
              <span className="text-xs font-medium text-muted-foreground">Venue</span>
            </div>
            <div className="col-span-2 text-right">
              <SortButton label="Selling Price" field="sellingPrice" />
            </div>
            <div className="col-span-1 text-right">
              <span className="text-xs font-medium text-muted-foreground">Food Cost</span>
            </div>
            <div className="col-span-2 text-center">
              <SortButton label="Cost %" field="foodCostPercentage" />
            </div>
            <div className="col-span-2 text-right">
              <SortButton label="Gross Profit" field="grossProfit" />
            </div>
          </div>

          {/* Rows */}
          <div className="divide-y divide-border">
            {filtered.map((dish) => {
              const costBadge = getCostBadge(dish.foodCostPercentage)
              const isExpanded = expandedId === dish.id
              const venueBadge = VENUE_BADGE[dish.venue] || VENUE_BADGE.BOTH

              return (
                <div key={dish.id}>
                  {/* Main row */}
                  <div
                    className="group cursor-pointer px-4 py-3 transition-colors hover:bg-muted/30 sm:grid sm:grid-cols-12 sm:items-center sm:gap-4"
                    onClick={() => setExpandedId(isExpanded ? null : dish.id)}
                  >
                    {/* Name */}
                    <div className="col-span-4 flex items-center gap-3">
                      <ChevronDown
                        className={cn(
                          "hidden h-4 w-4 shrink-0 text-muted-foreground transition-transform sm:block",
                          isExpanded && "rotate-180"
                        )}
                      />
                      <div>
                        <p className="font-medium text-foreground">{dish.name}</p>
                        <p className="text-xs text-muted-foreground sm:hidden">
                          {MENU_CATEGORY_LABELS[dish.menuCategory]}
                        </p>
                      </div>
                    </div>

                    {/* Venue */}
                    <div className="col-span-1 mt-2 flex justify-center sm:mt-0">
                      <Badge
                        className={cn("border-0 text-[10px]", venueBadge.className)}
                      >
                        {venueBadge.label}
                      </Badge>
                    </div>

                    {/* Selling price */}
                    <div className="col-span-2 mt-1 text-right sm:mt-0">
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(dish.sellingPrice)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        ex GST {formatCurrency(dish.sellingPriceExGst)}
                      </p>
                    </div>

                    {/* Food cost */}
                    <div className="col-span-1 mt-1 text-right sm:mt-0">
                      <p className="text-sm text-foreground">
                        {formatCurrency(dish.totalCost)}
                      </p>
                    </div>

                    {/* Cost % traffic light */}
                    <div className="col-span-2 mt-1 flex justify-center sm:mt-0">
                      <Badge variant={costBadge.variant} className="px-3 py-1 text-sm font-bold">
                        {costBadge.label}
                      </Badge>
                    </div>

                    {/* Gross profit */}
                    <div className="col-span-2 mt-1 text-right sm:mt-0">
                      <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                        {formatCurrency(dish.grossProfit)}
                      </p>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="border-t border-dashed border-border bg-muted/20 px-4 py-4 sm:pl-12">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Component Breakdown
                        </h4>
                        <button
                          type="button"
                          className="text-xs font-medium text-primary hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingDish(dish)
                          }}
                        >
                          Edit Dish
                        </button>
                      </div>

                      {dish.components.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No components added</p>
                      ) : (
                        <div className="space-y-1.5">
                          {dish.components.map((comp) => (
                            <div
                              key={comp.id}
                              className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-xs leading-none">
                                  {comp.ingredientId ? "\u{1f955}" : "\u{1f373}"}
                                </span>
                                <span className="font-medium">
                                  {comp.ingredient?.name || comp.preparation?.name}
                                </span>
                                <span className="text-muted-foreground">
                                  {comp.quantity}{comp.unit}
                                </span>
                              </div>
                              <span className="font-medium">
                                {formatCurrency(comp.lineCost)}
                              </span>
                            </div>
                          ))}
                          <div className="flex items-center justify-between border-t border-border pt-2">
                            <span className="text-xs font-medium text-muted-foreground">Total</span>
                            <span className="text-sm font-bold text-foreground">
                              {formatCurrency(dish.totalCost)}
                            </span>
                          </div>
                        </div>
                      )}

                      {dish.notes && (
                        <p className="mt-3 text-xs text-muted-foreground">
                          {dish.notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      {editingDish && (
        <DishForm
          dish={editingDish}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingDish(null)
          }}
        />
      )}
    </div>
  )
}
