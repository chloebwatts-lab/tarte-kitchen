"use client"

import { useState, useCallback, useTransition, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { globalSearch } from "@/lib/actions/search"
import { createDish, updateDish, deleteDish } from "@/lib/actions/dishes"
import { cn } from "@/lib/utils"
import Decimal from "decimal.js"
import {
  costPerBaseUnit,
  toBaseUnits,
  preparationLineCost as calcPrepLineCost,
  getRecipeUnits,
  getPreparationUnits,
  exGst,
  foodCostPercentage,
  costTrafficLight,
} from "@/lib/units"
import type { BaseUnitType } from "@/lib/units"

// ---------- Types ----------

interface IngredientRef {
  id: string
  name: string
  category: string
  baseUnitType: string
  purchasePrice: number
  baseUnitsPerPurchase: number
  wastePercentage: number
}

interface PreparationRef {
  id: string
  name: string
  category: string
  batchCost: number
  yieldQuantity: number
  yieldUnit: string
  yieldWeightGrams: number
}

interface ComponentRow {
  key: string
  type: "ingredient" | "preparation" | null
  ingredientId: string | null
  ingredient: IngredientRef | null
  preparationId: string | null
  preparation: PreparationRef | null
  quantity: string
  unit: string
  lineCost: number
}

interface DishData {
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
  components: Array<{
    id: string
    ingredientId: string | null
    ingredient: IngredientRef | null
    preparationId: string | null
    preparation: PreparationRef | null
    quantity: number
    unit: string
    lineCost: number
    sortOrder: number
  }>
}

interface DishFormProps {
  dish?: DishData
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const MENU_CATEGORIES = [
  { value: "BREAKFAST", label: "Breakfast" },
  { value: "LUNCH", label: "Lunch" },
  { value: "SIDES", label: "Sides" },
  { value: "DRINKS", label: "Drinks" },
  { value: "KIDS", label: "Kids" },
  { value: "DESSERT", label: "Dessert" },
  { value: "SPECIAL", label: "Special" },
  { value: "OTHER", label: "Other" },
]

const VENUES = [
  { value: "BURLEIGH", label: "Burleigh" },
  { value: "CURRUMBIN", label: "Currumbin" },
  { value: "BOTH", label: "Both" },
]

function generateKey() {
  return Math.random().toString(36).slice(2, 10)
}

function calcIngredientLineCost(ing: IngredientRef, quantity: number, unit: string): number {
  try {
    const cpbu = costPerBaseUnit({
      purchasePrice: new Decimal(ing.purchasePrice),
      baseUnitsPerPurchase: new Decimal(ing.baseUnitsPerPurchase),
      wastePercentage: new Decimal(ing.wastePercentage),
    })
    const baseQty = toBaseUnits(quantity, unit)
    return Number(baseQty.mul(cpbu).toDecimalPlaces(4))
  } catch {
    return 0
  }
}

function calcSubPrepLineCost(prep: PreparationRef, quantity: number, unit: string): number {
  try {
    return Number(
      calcPrepLineCost(
        quantity,
        unit,
        prep.batchCost,
        prep.yieldQuantity,
        prep.yieldUnit,
        prep.yieldWeightGrams
      ).toDecimalPlaces(4)
    )
  } catch {
    return 0
  }
}

function getAvailableUnits(item: ComponentRow): string[] {
  if (item.type === "ingredient" && item.ingredient) {
    return getRecipeUnits(item.ingredient.baseUnitType)
  }
  if (item.type === "preparation") {
    return getPreparationUnits()
  }
  return ["g", "kg", "ml", "l", "ea"]
}

// ---------- Search Dropdown ----------

function ItemSearch({
  onSelect,
}: {
  onSelect: (type: "ingredient" | "preparation", data: IngredientRef | PreparationRef) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{
    ingredients: IngredientRef[]
    preparations: PreparationRef[]
  }>({ ingredients: [], preparations: [] })
  const [showDropdown, setShowDropdown] = useState(false)
  const [searching, setSearching] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults({ ingredients: [], preparations: [] })
      return
    }
    setSearching(true)
    try {
      const res = await globalSearch(q)
      setResults(res)
    } catch {
      setResults({ ingredients: [], preparations: [] })
    } finally {
      setSearching(false)
    }
  }, [])

  const handleChange = (value: string) => {
    setQuery(value)
    setShowDropdown(true)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => doSearch(value), 250)
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const hasResults = results.ingredients.length > 0 || results.preparations.length > 0

  return (
    <div ref={containerRef} className="relative">
      <Input
        placeholder="Search ingredients or preparations..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => query.length >= 2 && setShowDropdown(true)}
        className="text-sm"
      />
      {showDropdown && query.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg">
          {searching && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          )}
          {!searching && !hasResults && (
            <div className="py-4 text-center text-sm text-muted-foreground">
              No results found
            </div>
          )}
          {!searching && results.ingredients.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Ingredients
              </div>
              {results.ingredients.map((ing) => (
                <button
                  key={ing.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onSelect("ingredient", ing)
                    setQuery("")
                    setShowDropdown(false)
                  }}
                >
                  <span className="text-base leading-none">&#x1f955;</span>
                  <span className="flex-1">{ing.name}</span>
                  <span className="text-[10px] text-muted-foreground">{ing.category}</span>
                </button>
              ))}
            </div>
          )}
          {!searching && results.preparations.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Preparations
              </div>
              {results.preparations.map((prep) => (
                <button
                  key={prep.id}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onSelect("preparation", prep)
                    setQuery("")
                    setShowDropdown(false)
                  }}
                >
                  <span className="text-base leading-none">&#x1f373;</span>
                  <span className="flex-1">{prep.name}</span>
                  <span className="text-[10px] text-muted-foreground">{prep.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- Main Form ----------

export function DishForm({ dish, open: controlledOpen, onOpenChange }: DishFormProps) {
  const isEdit = !!dish
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const dialogOpen = isControlled ? controlledOpen : internalOpen
  const setDialogOpen = isControlled
    ? (v: boolean) => onOpenChange?.(v)
    : setInternalOpen

  // Form state
  const [name, setName] = useState(dish?.name ?? "")
  const [menuCategory, setMenuCategory] = useState(dish?.menuCategory ?? "OTHER")
  const [venue, setVenue] = useState(dish?.venue ?? "BOTH")
  const [sellingPrice, setSellingPrice] = useState(
    dish ? String(dish.sellingPrice) : ""
  )
  const [notes, setNotes] = useState(dish?.notes ?? "")

  const [components, setComponents] = useState<ComponentRow[]>(() => {
    if (dish?.components) {
      return dish.components.map((comp) => ({
        key: generateKey(),
        type: comp.ingredientId
          ? ("ingredient" as const)
          : comp.preparationId
            ? ("preparation" as const)
            : null,
        ingredientId: comp.ingredientId,
        ingredient: comp.ingredient as IngredientRef | null,
        preparationId: comp.preparationId,
        preparation: comp.preparation as PreparationRef | null,
        quantity: String(comp.quantity),
        unit: comp.unit,
        lineCost: comp.lineCost,
      }))
    }
    return []
  })

  // Derived costs
  const sellingPriceNum = parseFloat(sellingPrice) || 0
  const sellingPriceExGstVal = sellingPriceNum > 0 ? Number(exGst(sellingPriceNum).toDecimalPlaces(2)) : 0
  const totalCost = components.reduce((sum, c) => sum + c.lineCost, 0)
  const fcPct = sellingPriceNum > 0
    ? Number(foodCostPercentage(totalCost, sellingPriceNum).toDecimalPlaces(1))
    : 0
  const grossProfit = sellingPriceExGstVal - totalCost
  const trafficLight = costTrafficLight(fcPct)

  const recalcItem = useCallback((item: ComponentRow): ComponentRow => {
    const qty = parseFloat(item.quantity) || 0
    if (qty <= 0 || !item.unit) return { ...item, lineCost: 0 }

    if (item.type === "ingredient" && item.ingredient) {
      return { ...item, lineCost: calcIngredientLineCost(item.ingredient, qty, item.unit) }
    }
    if (item.type === "preparation" && item.preparation) {
      return { ...item, lineCost: calcSubPrepLineCost(item.preparation, qty, item.unit) }
    }
    return { ...item, lineCost: 0 }
  }, [])

  const handleAddComponent = () => {
    setComponents((prev) => [
      ...prev,
      {
        key: generateKey(),
        type: null,
        ingredientId: null,
        ingredient: null,
        preparationId: null,
        preparation: null,
        quantity: "",
        unit: "g",
        lineCost: 0,
      },
    ])
  }

  const handleSelectItem = (index: number, type: "ingredient" | "preparation", data: IngredientRef | PreparationRef) => {
    setComponents((prev) => {
      const next = [...prev]
      if (type === "ingredient") {
        const ing = data as IngredientRef
        const defaultUnit = getRecipeUnits(ing.baseUnitType)[0]
        next[index] = {
          ...next[index],
          type: "ingredient",
          ingredientId: ing.id,
          ingredient: ing,
          preparationId: null,
          preparation: null,
          unit: defaultUnit,
        }
      } else {
        const prep = data as PreparationRef
        next[index] = {
          ...next[index],
          type: "preparation",
          ingredientId: null,
          ingredient: null,
          preparationId: prep.id,
          preparation: prep,
          unit: "g",
        }
      }
      next[index] = recalcItem(next[index])
      return next
    })
  }

  const handleQuantityChange = (index: number, value: string) => {
    setComponents((prev) => {
      const next = [...prev]
      next[index] = recalcItem({ ...next[index], quantity: value })
      return next
    })
  }

  const handleUnitChange = (index: number, value: string) => {
    setComponents((prev) => {
      const next = [...prev]
      next[index] = recalcItem({ ...next[index], unit: value })
      return next
    })
  }

  const handleRemoveComponent = (index: number) => {
    setComponents((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveComponent = (index: number, direction: -1 | 1) => {
    setComponents((prev) => {
      const next = [...prev]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= next.length) return prev
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const handleSubmit = () => {
    if (!name.trim() || sellingPriceNum <= 0) return

    const payload = {
      name: name.trim(),
      menuCategory,
      venue,
      sellingPrice: sellingPriceNum,
      notes: notes.trim() || undefined,
      components: components
        .filter((c) => c.type !== null && (parseFloat(c.quantity) || 0) > 0)
        .map((c, i) => ({
          ingredientId: c.ingredientId || null,
          preparationId: c.preparationId || null,
          quantity: parseFloat(c.quantity) || 0,
          unit: c.unit,
          sortOrder: i,
        })),
    }

    startTransition(async () => {
      if (isEdit && dish) {
        await updateDish(dish.id, payload)
      } else {
        await createDish(payload)
      }
      setDialogOpen(false)
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (!dish) return
    startTransition(async () => {
      await deleteDish(dish.id)
      setDialogOpen(false)
      router.refresh()
    })
  }

  const formContent = (
    <div className="max-h-[80vh] space-y-6 overflow-y-auto pr-1">
      {/* Basic info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="dish-name">Name</Label>
          <Input
            id="dish-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Smashed Avo on Sourdough"
          />
        </div>
        <div className="space-y-2">
          <Label>Menu Category</Label>
          <Select value={menuCategory} onValueChange={setMenuCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MENU_CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Venue</Label>
          <Select value={venue} onValueChange={setVenue}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VENUES.map((v) => (
                <SelectItem key={v.value} value={v.value}>
                  {v.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Pricing */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dish-price">Selling Price (inc GST)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              $
            </span>
            <Input
              id="dish-price"
              type="number"
              min="0"
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              placeholder="0.00"
              className="pl-7"
            />
          </div>
        </div>
        <div className="flex items-end pb-2">
          <p className="text-sm text-muted-foreground">
            Ex GST: <span className="font-medium text-foreground">${sellingPriceExGstVal.toFixed(2)}</span>
          </p>
        </div>
      </div>

      <Separator />

      {/* Components builder */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Components</h3>
        <div className="space-y-3">
          {components.map((comp, index) => (
            <div
              key={comp.key}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    onClick={() => handleMoveComponent(index, -1)}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    onClick={() => handleMoveComponent(index, 1)}
                    disabled={index === components.length - 1}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  {comp.type === null ? (
                    <ItemSearch
                      onSelect={(type, data) => handleSelectItem(index, type, data)}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">
                        {comp.type === "ingredient" ? "\u{1f955}" : "\u{1f373}"}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {comp.type === "ingredient"
                          ? comp.ingredient?.name
                          : comp.preparation?.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {comp.type === "ingredient"
                          ? comp.ingredient?.category
                          : comp.preparation?.category}
                      </Badge>
                    </div>
                  )}

                  {comp.type !== null && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Qty"
                        value={comp.quantity}
                        onChange={(e) => handleQuantityChange(index, e.target.value)}
                        className="w-24 text-sm"
                      />
                      <Select
                        value={comp.unit}
                        onValueChange={(v) => handleUnitChange(index, v)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableUnits(comp).map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="ml-auto text-sm font-medium text-foreground">
                        ${comp.lineCost.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="mt-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleRemoveComponent(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleAddComponent}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Component
          </Button>
        </div>
      </div>

      <Separator />

      {/* Live cost summary */}
      <div className="rounded-lg bg-muted/50 p-5">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Cost Summary</h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Total Cost
            </p>
            <p className="text-2xl font-bold text-foreground">${totalCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Food Cost %
            </p>
            <div className="flex items-baseline gap-2">
              <p
                className={cn(
                  "text-2xl font-bold",
                  trafficLight === "green" && "text-green-600 dark:text-green-400",
                  trafficLight === "amber" && "text-amber-600 dark:text-amber-400",
                  trafficLight === "red" && "text-red-600 dark:text-red-400"
                )}
              >
                {fcPct.toFixed(1)}%
              </p>
              <Badge
                variant={trafficLight}
                className="text-[10px]"
              >
                {trafficLight === "green" ? "Good" : trafficLight === "amber" ? "Watch" : "High"}
              </Badge>
            </div>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Gross Profit
            </p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
              ${grossProfit.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label htmlFor="dish-notes">Notes</Label>
        <Textarea
          id="dish-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Kitchen notes, allergens, plating instructions..."
          rows={2}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button
          onClick={handleSubmit}
          disabled={isPending || !name.trim() || sellingPriceNum <= 0}
          className="flex-1"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Update Dish" : "Create Dish"}
        </Button>
        {isEdit && (
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )

  if (isControlled) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Dish" : "Add Dish"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the dish details, components, and pricing below."
                : "Fill in the details to add a new menu item."}
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Dish
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Dish</DialogTitle>
          <DialogDescription>
            Fill in the details to add a new menu item.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
