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
import { createPreparation, updatePreparation, deletePreparation } from "@/lib/actions/preparations"
import { cn } from "@/lib/utils"
import Decimal from "decimal.js"
import {
  costPerBaseUnit,
  toBaseUnits,
  preparationLineCost as calcPrepLineCost,
  getRecipeUnits,
  getPreparationUnits,
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

interface ItemRow {
  key: string
  type: "ingredient" | "preparation" | null
  ingredientId: string | null
  ingredient: IngredientRef | null
  subPreparationId: string | null
  subPreparation: PreparationRef | null
  quantity: string
  unit: string
  lineCost: number
}

interface PreparationData {
  id: string
  name: string
  category: string
  method: string | null
  yieldQuantity: number
  yieldUnit: string
  yieldWeightGrams: number
  batchCost: number
  costPerGram: number
  costPerServe: number
  items: Array<{
    id: string
    ingredientId: string | null
    ingredient: IngredientRef | null
    subPreparationId: string | null
    subPreparation: PreparationRef | null
    quantity: number
    unit: string
    lineCost: number
    sortOrder: number
  }>
}

interface PreparationFormProps {
  preparation?: PreparationData
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const CATEGORIES = [
  { value: "SAUCE", label: "Sauce" },
  { value: "DRESSING", label: "Dressing" },
  { value: "MIX", label: "Mix" },
  { value: "BASE", label: "Base" },
  { value: "PRESERVED", label: "Preserved" },
  { value: "PASTRY", label: "Pastry" },
  { value: "BREAD", label: "Bread" },
  { value: "COMPONENT", label: "Component" },
  { value: "GARNISH", label: "Garnish" },
  { value: "OTHER", label: "Other" },
]

const YIELD_UNITS = [
  { value: "serves", label: "Serves" },
  { value: "g", label: "Grams (g)" },
  { value: "ml", label: "Milliliters (ml)" },
  { value: "l", label: "Liters (l)" },
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
      baseUnitType: ing.baseUnitType as BaseUnitType,
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

function getAvailableUnits(item: ItemRow): string[] {
  if (item.type === "ingredient" && item.ingredient) {
    return getRecipeUnits(item.ingredient.baseUnitType)
  }
  if (item.type === "preparation") {
    return getPreparationUnits()
  }
  return ["g", "kg", "ml", "l", "ea"]
}

// ---------- Search Dropdown Component ----------

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
      {showDropdown && (query.length >= 2) && (
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

export function PreparationForm({ preparation, open: controlledOpen, onOpenChange }: PreparationFormProps) {
  const isEdit = !!preparation
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const dialogOpen = isControlled ? controlledOpen : internalOpen
  const setDialogOpen = isControlled
    ? (v: boolean) => onOpenChange?.(v)
    : setInternalOpen

  // Form state
  const [name, setName] = useState(preparation?.name ?? "")
  const [category, setCategory] = useState(preparation?.category ?? "OTHER")
  const [method, setMethod] = useState(preparation?.method ?? "")
  const [yieldQuantity, setYieldQuantity] = useState(
    preparation ? String(preparation.yieldQuantity) : ""
  )
  const [yieldUnit, setYieldUnit] = useState(preparation?.yieldUnit ?? "serves")
  const [yieldWeightGrams, setYieldWeightGrams] = useState(
    preparation ? String(preparation.yieldWeightGrams) : ""
  )

  const [items, setItems] = useState<ItemRow[]>(() => {
    if (preparation?.items) {
      return preparation.items.map((item) => ({
        key: generateKey(),
        type: item.ingredientId
          ? ("ingredient" as const)
          : item.subPreparationId
            ? ("preparation" as const)
            : null,
        ingredientId: item.ingredientId,
        ingredient: item.ingredient as IngredientRef | null,
        subPreparationId: item.subPreparationId,
        subPreparation: item.subPreparation as PreparationRef | null,
        quantity: String(item.quantity),
        unit: item.unit,
        lineCost: item.lineCost,
      }))
    }
    return []
  })

  // Recalculate line costs whenever items change
  const recalcItem = useCallback((item: ItemRow): ItemRow => {
    const qty = parseFloat(item.quantity) || 0
    if (qty <= 0 || !item.unit) return { ...item, lineCost: 0 }

    if (item.type === "ingredient" && item.ingredient) {
      return { ...item, lineCost: calcIngredientLineCost(item.ingredient, qty, item.unit) }
    }
    if (item.type === "preparation" && item.subPreparation) {
      return { ...item, lineCost: calcSubPrepLineCost(item.subPreparation, qty, item.unit) }
    }
    return { ...item, lineCost: 0 }
  }, [])

  const batchCost = items.reduce((sum, item) => sum + item.lineCost, 0)
  const yieldGrams = parseFloat(yieldWeightGrams) || 0
  const yieldQty = parseFloat(yieldQuantity) || 0
  const costPerGram = yieldGrams > 0 ? batchCost / yieldGrams : 0
  const costPerServe = yieldQty > 0 ? batchCost / yieldQty : 0

  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      {
        key: generateKey(),
        type: null,
        ingredientId: null,
        ingredient: null,
        subPreparationId: null,
        subPreparation: null,
        quantity: "",
        unit: "g",
        lineCost: 0,
      },
    ])
  }

  const handleSelectItem = (index: number, type: "ingredient" | "preparation", data: IngredientRef | PreparationRef) => {
    setItems((prev) => {
      const next = [...prev]
      if (type === "ingredient") {
        const ing = data as IngredientRef
        const defaultUnit = getRecipeUnits(ing.baseUnitType)[0]
        next[index] = {
          ...next[index],
          type: "ingredient",
          ingredientId: ing.id,
          ingredient: ing,
          subPreparationId: null,
          subPreparation: null,
          unit: defaultUnit,
        }
      } else {
        const prep = data as PreparationRef
        next[index] = {
          ...next[index],
          type: "preparation",
          ingredientId: null,
          ingredient: null,
          subPreparationId: prep.id,
          subPreparation: prep,
          unit: "g",
        }
      }
      next[index] = recalcItem(next[index])
      return next
    })
  }

  const handleQuantityChange = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = recalcItem({ ...next[index], quantity: value })
      return next
    })
  }

  const handleUnitChange = (index: number, value: string) => {
    setItems((prev) => {
      const next = [...prev]
      next[index] = recalcItem({ ...next[index], unit: value })
      return next
    })
  }

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const handleMoveItem = (index: number, direction: -1 | 1) => {
    setItems((prev) => {
      const next = [...prev]
      const targetIndex = index + direction
      if (targetIndex < 0 || targetIndex >= next.length) return prev
      ;[next[index], next[targetIndex]] = [next[targetIndex], next[index]]
      return next
    })
  }

  const handleSubmit = () => {
    if (!name.trim()) return

    const payload = {
      name: name.trim(),
      category,
      method: method.trim() || undefined,
      yieldQuantity: parseFloat(yieldQuantity) || 0,
      yieldUnit,
      yieldWeightGrams: parseFloat(yieldWeightGrams) || 0,
      items: items
        .filter((item) => item.type !== null && (parseFloat(item.quantity) || 0) > 0)
        .map((item, i) => ({
          ingredientId: item.ingredientId || null,
          subPreparationId: item.subPreparationId || null,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit,
          sortOrder: i,
        })),
    }

    startTransition(async () => {
      if (isEdit && preparation) {
        await updatePreparation(preparation.id, payload)
      } else {
        await createPreparation(payload)
      }
      setDialogOpen(false)
      router.refresh()
    })
  }

  const handleDelete = () => {
    if (!preparation) return
    startTransition(async () => {
      await deletePreparation(preparation.id)
      setDialogOpen(false)
      router.refresh()
    })
  }

  const formContent = (
    <div className="max-h-[80vh] space-y-6 overflow-y-auto pr-1">
      {/* Basic info */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="prep-name">Name</Label>
          <Input
            id="prep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hollandaise Sauce"
          />
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((cat) => (
                <SelectItem key={cat.value} value={cat.value}>
                  {cat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="prep-method">Method</Label>
        <Textarea
          id="prep-method"
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          placeholder="Preparation instructions..."
          rows={3}
        />
      </div>

      <Separator />

      {/* Yield */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Yield</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="prep-yield-qty">Quantity</Label>
            <Input
              id="prep-yield-qty"
              type="number"
              min="0"
              step="any"
              value={yieldQuantity}
              onChange={(e) => setYieldQuantity(e.target.value)}
              placeholder="e.g. 76"
            />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={yieldUnit} onValueChange={setYieldUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YIELD_UNITS.map((u) => (
                  <SelectItem key={u.value} value={u.value}>
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prep-yield-grams">Total Weight (g)</Label>
            <Input
              id="prep-yield-grams"
              type="number"
              min="0"
              step="any"
              value={yieldWeightGrams}
              onChange={(e) => setYieldWeightGrams(e.target.value)}
              placeholder="e.g. 3800"
            />
            <p className="text-[11px] text-muted-foreground">
              Total batch weight in grams
            </p>
          </div>
        </div>
      </div>

      <Separator />

      {/* Ingredient list builder */}
      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Ingredients</h3>
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.key}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    onClick={() => handleMoveItem(index, -1)}
                    disabled={index === 0}
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30"
                    onClick={() => handleMoveItem(index, 1)}
                    disabled={index === items.length - 1}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="flex-1 space-y-2">
                  {/* Item selection */}
                  {item.type === null ? (
                    <ItemSearch
                      onSelect={(type, data) => handleSelectItem(index, type, data)}
                    />
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">
                        {item.type === "ingredient" ? "\u{1f955}" : "\u{1f373}"}
                      </span>
                      <span className="text-sm font-medium text-foreground">
                        {item.type === "ingredient"
                          ? item.ingredient?.name
                          : item.subPreparation?.name}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {item.type === "ingredient"
                          ? item.ingredient?.category
                          : item.subPreparation?.category}
                      </Badge>
                    </div>
                  )}

                  {/* Quantity + Unit */}
                  {item.type !== null && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="Qty"
                        value={item.quantity}
                        onChange={(e) => handleQuantityChange(index, e.target.value)}
                        className="w-24 text-sm"
                      />
                      <Select
                        value={item.unit}
                        onValueChange={(v) => handleUnitChange(index, v)}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {getAvailableUnits(item).map((u) => (
                            <SelectItem key={u} value={u}>
                              {u}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="ml-auto text-sm font-medium text-foreground">
                        ${item.lineCost.toFixed(2)}
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  className="mt-1 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => handleRemoveItem(index)}
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
            onClick={handleAddItem}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Ingredient
          </Button>
        </div>
      </div>

      <Separator />

      {/* Cost summary */}
      <div className="rounded-lg bg-muted/50 p-4">
        <h3 className="mb-3 text-sm font-semibold text-foreground">Cost Summary</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Batch Cost
            </p>
            <p className="text-lg font-bold text-foreground">${batchCost.toFixed(2)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Per Gram
            </p>
            <p className="text-lg font-bold text-foreground">${costPerGram.toFixed(4)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Per Serve
            </p>
            <p className="text-lg font-bold text-foreground">${costPerServe.toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={handleSubmit} disabled={isPending || !name.trim()} className="flex-1">
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? "Update Preparation" : "Create Preparation"}
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

  // If controlled (editing), render dialog without trigger
  if (isControlled) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit Preparation" : "Add Preparation"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update the preparation details and ingredients below."
                : "Fill in the details to create a new preparation."}
            </DialogDescription>
          </DialogHeader>
          {formContent}
        </DialogContent>
      </Dialog>
    )
  }

  // Trigger mode (Add button)
  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          Add Preparation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Preparation</DialogTitle>
          <DialogDescription>
            Fill in the details to create a new preparation.
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
