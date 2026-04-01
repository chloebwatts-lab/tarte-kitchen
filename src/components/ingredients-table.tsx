"use client"

import { useState, useMemo, useCallback, useTransition, useRef, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Search, SlidersHorizontal, Pencil, Trash2, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import { IngredientForm } from "@/components/ingredient-form"
import { bulkUpdatePrices, deleteIngredient, updateIngredientQuick } from "@/lib/actions/ingredients"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Supplier {
  id: string
  name: string
}

interface Ingredient {
  id: string
  name: string
  category: string
  baseUnitType: string
  supplierId: string | null
  supplier: { id: string; name: string } | null
  supplierProductCode: string | null
  purchaseQuantity: number
  purchaseUnit: string
  purchasePrice: number
  baseUnitsPerPurchase: number
  gramsPerUnit: number | null
  wastePercentage: number
  parLevel: number | null
  parUnit: string | null
  notes: string | null
  createdAt: Date | string
  updatedAt: Date | string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES = [
  "ALL",
  "MEAT",
  "SEAFOOD",
  "DAIRY",
  "CHEESE",
  "VEGETABLE",
  "FRUIT",
  "HERB",
  "MUSHROOM",
  "SPICE",
  "DRY_GOOD",
  "GRAIN",
  "FLOUR",
  "OIL",
  "VINEGAR",
  "BREAD",
  "BAKERY",
  "EGG",
  "CONDIMENT",
  "FROZEN",
  "SALAD",
  "OTHER",
] as const

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "All",
  MEAT: "Meat",
  SEAFOOD: "Seafood",
  DAIRY: "Dairy",
  CHEESE: "Cheese",
  VEGETABLE: "Vegetable",
  FRUIT: "Fruit",
  HERB: "Herb",
  MUSHROOM: "Mushroom",
  SPICE: "Spice",
  DRY_GOOD: "Dry Good",
  GRAIN: "Grain",
  FLOUR: "Flour",
  OIL: "Oil",
  VINEGAR: "Vinegar",
  BREAD: "Bread",
  BAKERY: "Bakery",
  EGG: "Egg",
  CONDIMENT: "Condiment",
  FROZEN: "Frozen",
  SALAD: "Salad",
  OTHER: "Other",
}

const BASE_UNIT_LABELS: Record<string, string> = {
  WEIGHT: "g",
  VOLUME: "ml",
  COUNT: "ea",
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function costPerUsableUnit(ingredient: Ingredient): number {
  const wasteFactor = 1 - ingredient.wastePercentage / 100
  const usable = ingredient.baseUnitsPerPurchase * wasteFactor
  if (usable <= 0) return 0
  return ingredient.purchasePrice / usable
}

function costPerBaseUnit(ingredient: Ingredient): number {
  if (ingredient.baseUnitsPerPurchase <= 0) return 0
  return ingredient.purchasePrice / ingredient.baseUnitsPerPurchase
}

function formatCurrency(value: number): string {
  if (value < 0.01 && value > 0) {
    return `$${value.toFixed(4)}`
  }
  return `$${value.toFixed(2)}`
}

function formatCostPerUnit(value: number, unitType: string): string {
  const unit = BASE_UNIT_LABELS[unitType] || "unit"
  if (value < 0.01 && value > 0) {
    return `$${value.toFixed(4)}/${unit}`
  }
  return `$${value.toFixed(2)}/${unit}`
}

function isRecentlyUpdated(updatedAt: string | Date): boolean {
  const updated = new Date(updatedAt)
  const threeDaysAgo = new Date()
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
  return updated > threeDaysAgo
}

function formatDate(dateStr: string | Date): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// ---------------------------------------------------------------------------
// Inline Editable Field
// ---------------------------------------------------------------------------

function InlineField({
  label,
  value,
  suffix,
  prefix,
  step,
  ingredientId,
  field,
  onSaved,
  allowNull,
}: {
  label: string
  value: number | null
  suffix?: string
  prefix?: string
  step?: string
  ingredientId: string
  field: "purchasePrice" | "baseUnitsPerPurchase" | "wastePercentage" | "gramsPerUnit"
  onSaved: () => void
  allowNull?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value !== null ? String(value) : "")
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const save = () => {
    if (draft === "" && allowNull) {
      startTransition(async () => {
        await updateIngredientQuick(ingredientId, { [field]: null })
        onSaved()
        setEditing(false)
      })
      return
    }
    const num = parseFloat(draft)
    if (isNaN(num) || num < 0) {
      setDraft(value !== null ? String(value) : "")
      setEditing(false)
      return
    }
    if (num === value) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      await updateIngredientQuick(ingredientId, { [field]: num })
      onSaved()
      setEditing(false)
    })
  }

  const cancel = () => {
    setDraft(value !== null ? String(value) : "")
    setEditing(false)
  }

  if (editing) {
    return (
      <div onClick={(e) => e.stopPropagation()}>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1 mt-0.5">
          {prefix && <span className="text-sm text-muted-foreground">{prefix}</span>}
          <Input
            ref={inputRef}
            type="number"
            step={step || "0.01"}
            min="0"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save()
              if (e.key === "Escape") cancel()
            }}
            onBlur={save}
            className="h-7 w-24 px-1 text-sm"
            disabled={isPending}
          />
          {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <button
        type="button"
        className="font-medium tabular-nums hover:text-primary hover:underline decoration-dashed underline-offset-2"
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {prefix}{value !== null ? value : "—"}{suffix}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface IngredientsTableProps {
  ingredients: Ingredient[]
  suppliers: Supplier[]
  initialSearch: string
  initialCategory: string
}

export function IngredientsTable({
  ingredients,
  suppliers,
  initialSearch,
  initialCategory,
}: IngredientsTableProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [isPending, startTransition] = useTransition()

  const [search, setSearch] = useState(initialSearch)
  const [activeCategory, setActiveCategory] = useState(initialCategory)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [bulkMode, setBulkMode] = useState(false)
  const [bulkPrices, setBulkPrices] = useState<Record<string, string>>({})
  const [savingBulk, setSavingBulk] = useState<Record<string, boolean>>({})
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // URL sync (debounced on search, immediate on category)
  const updateURL = useCallback(
    (newSearch: string, newCategory: string) => {
      const sp = new URLSearchParams()
      if (newSearch) sp.set("search", newSearch)
      if (newCategory && newCategory !== "ALL") sp.set("category", newCategory)
      const qs = sp.toString()
      startTransition(() => {
        router.push(`/ingredients${qs ? `?${qs}` : ""}`, { scroll: false })
      })
    },
    [router]
  )

  // Debounce search URL updates
  const [debounceTimer, setDebounceTimer] = useState<NodeJS.Timeout | null>(null)

  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value)
      if (debounceTimer) clearTimeout(debounceTimer)
      const timer = setTimeout(() => updateURL(value, activeCategory), 400)
      setDebounceTimer(timer)
    },
    [activeCategory, debounceTimer, updateURL]
  )

  const handleCategoryChange = useCallback(
    (cat: string) => {
      setActiveCategory(cat)
      updateURL(search, cat)
    },
    [search, updateURL]
  )

  // Local filtering (instant)
  const filtered = useMemo(() => {
    let result = ingredients

    // Category filter
    if (activeCategory && activeCategory !== "ALL") {
      result = result.filter((i) => i.category === activeCategory)
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.supplier?.name.toLowerCase().includes(q) ||
          i.category.toLowerCase().includes(q) ||
          i.supplierProductCode?.toLowerCase().includes(q)
      )
    }

    return result
  }, [ingredients, activeCategory, search])

  // Bulk price save
  const handleBulkPriceSave = useCallback(
    async (ingredient: Ingredient) => {
      const newPrice = bulkPrices[ingredient.id]
      if (!newPrice || isNaN(Number(newPrice))) return

      setSavingBulk((prev) => ({ ...prev, [ingredient.id]: true }))
      try {
        await bulkUpdatePrices([{
          id: ingredient.id,
          purchasePrice: Number(newPrice),
        }])
        setBulkPrices((prev) => {
          const next = { ...prev }
          delete next[ingredient.id]
          return next
        })
        router.refresh()
      } finally {
        setSavingBulk((prev) => ({ ...prev, [ingredient.id]: false }))
      }
    },
    [bulkPrices, router]
  )

  // Delete handler
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("Delete this ingredient? This cannot be undone.")) return
      setDeletingId(id)
      try {
        await deleteIngredient(id)
        router.refresh()
      } finally {
        setDeletingId(null)
      }
    },
    [router]
  )

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: ingredients.length }
    for (const i of ingredients) {
      counts[i.category] = (counts[i.category] || 0) + 1
    }
    return counts
  }, [ingredients])

  return (
    <div className="space-y-4">
      {/* Search + Bulk toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ingredients..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-white shadow-sm"
          />
        </div>
        <Button
          variant={bulkMode ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setBulkMode(!bulkMode)
            setBulkPrices({})
          }}
          className="gap-2"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Bulk Pricing</span>
        </Button>
      </div>

      {/* Category tabs */}
      <ScrollArea className="w-full">
        <div className="flex gap-1 pb-2">
          {CATEGORIES.map((cat) => {
            const count = categoryCounts[cat] || 0
            if (cat !== "ALL" && count === 0) return null
            return (
              <button
                key={cat}
                onClick={() => handleCategoryChange(cat)}
                className={cn(
                  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  activeCategory === cat
                    ? "bg-foreground text-background shadow-sm"
                    : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {CATEGORY_LABELS[cat]}
                <span
                  className={cn(
                    "text-[10px] tabular-nums",
                    activeCategory === cat ? "text-background/70" : "text-muted-foreground/60"
                  )}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      {/* Loading indicator */}
      {isPending && (
        <div className="h-0.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-primary" />
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">No ingredients found</p>
            {search && (
              <Button
                variant="link"
                size="sm"
                onClick={() => handleSearchChange("")}
                className="mt-2"
              >
                Clear search
              </Button>
            )}
          </CardContent>
        </Card>
      ) : bulkMode ? (
        <BulkPriceTable
          ingredients={filtered}
          bulkPrices={bulkPrices}
          savingBulk={savingBulk}
          onPriceChange={(id, val) =>
            setBulkPrices((prev) => ({ ...prev, [id]: val }))
          }
          onSave={handleBulkPriceSave}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Card className="overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left">
                      <th className="w-8 px-4 py-3" />
                      <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Category</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Supplier</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Price</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">Waste %</th>
                      <th className="px-4 py-3 font-medium text-muted-foreground text-right">
                        Cost / {activeCategory !== "ALL" ? "" : "unit"}
                      </th>
                      <th className="px-4 py-3 font-medium text-muted-foreground">Updated</th>
                      <th className="w-20 px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((ingredient) => {
                      const isExpanded = expandedId === ingredient.id
                      const cpu = costPerUsableUnit(ingredient)
                      const unitLabel = BASE_UNIT_LABELS[ingredient.baseUnitType] || "unit"
                      const recentlyUpdated = isRecentlyUpdated(ingredient.updatedAt)

                      return (
                        <TableRow
                          key={ingredient.id}
                          ingredient={ingredient}
                          isExpanded={isExpanded}
                          cpu={cpu}
                          unitLabel={unitLabel}
                          recentlyUpdated={recentlyUpdated}
                          suppliers={suppliers}
                          deletingId={deletingId}
                          onToggle={() =>
                            setExpandedId(isExpanded ? null : ingredient.id)
                          }
                          onDelete={handleDelete}
                          onRefresh={() => router.refresh()}
                        />
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((ingredient) => {
              const cpu = costPerUsableUnit(ingredient)
              const unitLabel = BASE_UNIT_LABELS[ingredient.baseUnitType] || "unit"
              const recentlyUpdated = isRecentlyUpdated(ingredient.updatedAt)
              const isExpanded = expandedId === ingredient.id

              return (
                <MobileCard
                  key={ingredient.id}
                  ingredient={ingredient}
                  isExpanded={isExpanded}
                  cpu={cpu}
                  unitLabel={unitLabel}
                  recentlyUpdated={recentlyUpdated}
                  suppliers={suppliers}
                  deletingId={deletingId}
                  onToggle={() =>
                    setExpandedId(isExpanded ? null : ingredient.id)
                  }
                  onDelete={handleDelete}
                  onRefresh={() => router.refresh()}
                />
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table Row (Desktop)
// ---------------------------------------------------------------------------

function TableRow({
  ingredient,
  isExpanded,
  cpu,
  unitLabel,
  recentlyUpdated,
  suppliers,
  deletingId,
  onToggle,
  onDelete,
  onRefresh,
}: {
  ingredient: Ingredient
  isExpanded: boolean
  cpu: number
  unitLabel: string
  recentlyUpdated: boolean
  suppliers: Supplier[]
  deletingId: string | null
  onToggle: () => void
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  return (
    <>
      <tr
        className={cn(
          "border-b transition-colors hover:bg-muted/30 cursor-pointer",
          isExpanded && "bg-muted/20"
        )}
        onClick={onToggle}
      >
        <td className="px-4 py-3 text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </td>
        <td className="px-4 py-3 font-medium">{ingredient.name}</td>
        <td className="px-4 py-3">
          <Badge variant="secondary" className="text-[11px]">
            {CATEGORY_LABELS[ingredient.category] || ingredient.category}
          </Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {ingredient.supplier?.name || "\u2014"}
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {formatCurrency(ingredient.purchasePrice)}
          <span className="ml-1 text-xs text-muted-foreground">
            per {ingredient.purchaseQuantity}
            {ingredient.purchaseUnit}
          </span>
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          {ingredient.wastePercentage > 0 ? `${ingredient.wastePercentage}%` : "\u2014"}
        </td>
        <td className="px-4 py-3 text-right">
          <Badge
            variant={recentlyUpdated ? "green" : "outline"}
            className="tabular-nums text-[11px]"
          >
            {formatCostPerUnit(cpu, ingredient.baseUnitType)}
          </Badge>
        </td>
        <td className="px-4 py-3 text-muted-foreground text-xs">
          {formatDate(ingredient.updatedAt)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <IngredientForm ingredient={ingredient} suppliers={suppliers} onSuccess={onRefresh} />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive"
              disabled={deletingId === ingredient.id}
              onClick={() => onDelete(ingredient.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/10">
          <td colSpan={9} className="px-4 py-4">
            <ExpandedDetails ingredient={ingredient} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Expanded Details
// ---------------------------------------------------------------------------

function ExpandedDetails({ ingredient, onRefresh }: { ingredient: Ingredient; onRefresh: () => void }) {
  const cpb = costPerBaseUnit(ingredient)
  const cpu = costPerUsableUnit(ingredient)
  const unitLabel = BASE_UNIT_LABELS[ingredient.baseUnitType] || "unit"

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-4">
      <InlineField
        label={`Price per ${ingredient.purchaseQuantity}${ingredient.purchaseUnit}`}
        value={ingredient.purchasePrice}
        prefix="$"
        ingredientId={ingredient.id}
        field="purchasePrice"
        onSaved={onRefresh}
      />
      <InlineField
        label="Base Units per Purchase"
        value={ingredient.baseUnitsPerPurchase}
        suffix={` ${unitLabel}`}
        step="1"
        ingredientId={ingredient.id}
        field="baseUnitsPerPurchase"
        onSaved={onRefresh}
      />
      <InlineField
        label="Waste %"
        value={ingredient.wastePercentage}
        suffix="%"
        step="0.5"
        ingredientId={ingredient.id}
        field="wastePercentage"
        onSaved={onRefresh}
      />
      {ingredient.baseUnitType === "COUNT" && (
        <InlineField
          label="Grams per Unit"
          value={ingredient.gramsPerUnit}
          suffix="g"
          step="1"
          ingredientId={ingredient.id}
          field="gramsPerUnit"
          onSaved={onRefresh}
          allowNull
        />
      )}
      <div>
        <p className="text-xs text-muted-foreground">Cost per {unitLabel}</p>
        <p className="font-medium tabular-nums">{formatCostPerUnit(cpb, ingredient.baseUnitType)}</p>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Cost per usable {unitLabel}</p>
        <p className="font-medium tabular-nums">{formatCostPerUnit(cpu, ingredient.baseUnitType)}</p>
      </div>
      {ingredient.supplierProductCode && (
        <div>
          <p className="text-xs text-muted-foreground">Supplier Code</p>
          <p className="font-medium font-mono text-xs">{ingredient.supplierProductCode}</p>
        </div>
      )}
      {ingredient.notes && (
        <div className="col-span-2 sm:col-span-4">
          <p className="text-xs text-muted-foreground">Notes</p>
          <p className="text-muted-foreground">{ingredient.notes}</p>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Mobile Card
// ---------------------------------------------------------------------------

function MobileCard({
  ingredient,
  isExpanded,
  cpu,
  unitLabel,
  recentlyUpdated,
  suppliers,
  deletingId,
  onToggle,
  onDelete,
  onRefresh,
}: {
  ingredient: Ingredient
  isExpanded: boolean
  cpu: number
  unitLabel: string
  recentlyUpdated: boolean
  suppliers: Supplier[]
  deletingId: string | null
  onToggle: () => void
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  return (
    <Card className="shadow-sm">
      <div className="p-4 cursor-pointer" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-medium truncate">{ingredient.name}</h3>
              <Badge variant="secondary" className="text-[10px] shrink-0">
                {CATEGORY_LABELS[ingredient.category] || ingredient.category}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {ingredient.supplier?.name || "No supplier"}
            </p>
          </div>
          <div className="text-right shrink-0">
            <Badge
              variant={recentlyUpdated ? "green" : "outline"}
              className="tabular-nums text-[11px]"
            >
              {formatCostPerUnit(cpu, ingredient.baseUnitType)}
            </Badge>
            <p className="text-[10px] text-muted-foreground mt-1">
              {formatCurrency(ingredient.purchasePrice)} / {ingredient.purchaseQuantity}
              {ingredient.purchaseUnit}
            </p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <>
          <Separator />
          <div className="p-4 space-y-3">
            <ExpandedDetails ingredient={ingredient} onRefresh={onRefresh} />
            <Separator />
            <div className="flex items-center gap-2 pt-1">
              <IngredientForm ingredient={ingredient} suppliers={suppliers} onSuccess={onRefresh} />
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive"
                disabled={deletingId === ingredient.id}
                onClick={() => onDelete(ingredient.id)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Bulk Price Table
// ---------------------------------------------------------------------------

function BulkPriceTable({
  ingredients,
  bulkPrices,
  savingBulk,
  onPriceChange,
  onSave,
}: {
  ingredients: Ingredient[]
  bulkPrices: Record<string, string>
  savingBulk: Record<string, boolean>
  onPriceChange: (id: string, value: string) => void
  onSave: (ingredient: Ingredient) => void
}) {
  return (
    <Card className="overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30 text-left">
              <th className="px-4 py-3 font-medium text-muted-foreground">Name</th>
              <th className="px-4 py-3 font-medium text-muted-foreground">Current Price</th>
              <th className="px-4 py-3 font-medium text-muted-foreground w-48">New Price</th>
              <th className="px-4 py-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {ingredients.map((ingredient) => (
              <tr key={ingredient.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <span className="font-medium">{ingredient.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    per {ingredient.purchaseQuantity}
                    {ingredient.purchaseUnit}
                  </span>
                </td>
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                  {formatCurrency(ingredient.purchasePrice)}
                </td>
                <td className="px-4 py-2.5">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={ingredient.purchasePrice.toFixed(2)}
                    value={bulkPrices[ingredient.id] || ""}
                    onChange={(e) => onPriceChange(ingredient.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        onSave(ingredient)
                      }
                    }}
                    className="h-8 w-32 tabular-nums"
                  />
                </td>
                <td className="px-4 py-2.5">
                  {bulkPrices[ingredient.id] && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={savingBulk[ingredient.id]}
                      onClick={() => onSave(ingredient)}
                    >
                      {savingBulk[ingredient.id] ? "..." : "Save"}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// Re-export types for use in other components
export type { Ingredient, Supplier }
