"use client"

import { useState, useMemo, useTransition } from "react"
import { useRouter } from "next/navigation"
import Fuse from "fuse.js"
import Decimal from "decimal.js"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, X } from "lucide-react"
import { createWasteEntry } from "@/lib/actions/wastage"
import { toBaseUnits } from "@/lib/units"

type DishItem = {
  id: string
  name: string
  venue: string
  costPerUnit: number
  type: "dish"
  category: string
}

type IngredientItem = {
  id: string
  name: string
  costPerBaseUnit: number
  type: "ingredient"
  category: string
  baseUnitType: string
}

type FormItem = DishItem | IngredientItem

interface Props {
  items: {
    dishes: DishItem[]
    ingredients: IngredientItem[]
  }
}

const WASTE_REASONS = [
  { value: "OVERPRODUCTION", label: "Overproduction" },
  { value: "SPOILAGE", label: "Spoilage" },
  { value: "EXPIRED", label: "Expired" },
  { value: "DROPPED", label: "Dropped" },
  { value: "STAFF_MEAL", label: "Staff Meal" },
  { value: "CUSTOMER_RETURN", label: "Customer Return" },
  { value: "QUALITY_ISSUE", label: "Quality Issue" },
  { value: "OTHER", label: "Other" },
] as const

const UNIT_OPTIONS: Record<string, string[]> = {
  WEIGHT: ["g", "kg"],
  VOLUME: ["ml", "l"],
  COUNT: ["ea"],
  dish: ["ea"],
}

export function WasteEntryForm({ items }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const today = new Date().toISOString().split("T")[0]
  const [date, setDate] = useState(today)
  const [venue, setVenue] = useState<string>("")
  const [selectedItem, setSelectedItem] = useState<FormItem | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [unit, setUnit] = useState("")
  const [reason, setReason] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState("")

  // Combined item list for search
  const allItems = useMemo(() => {
    return [...items.dishes, ...items.ingredients] as FormItem[]
  }, [items])

  const fuse = useMemo(() => {
    return new Fuse(allItems, {
      keys: ["name"],
      threshold: 0.3,
      includeScore: true,
    })
  }, [allItems])

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return allItems.slice(0, 20)
    return fuse.search(searchQuery).map((r) => r.item).slice(0, 20)
  }, [searchQuery, fuse, allItems])

  // Available units based on selected item
  const availableUnits = useMemo(() => {
    if (!selectedItem) return ["ea", "g", "kg", "ml", "l"]
    if (selectedItem.type === "dish") return ["ea"]
    return UNIT_OPTIONS[selectedItem.baseUnitType] ?? ["ea"]
  }, [selectedItem])

  // Auto-calculate estimated cost
  const estimatedCost = useMemo(() => {
    if (!selectedItem || !quantity || isNaN(Number(quantity))) return 0

    const qty = Number(quantity)
    if (selectedItem.type === "dish") {
      return new Decimal(qty).mul(selectedItem.costPerUnit).toDecimalPlaces(2).toNumber()
    }

    // Ingredient: cost per base unit * base units
    try {
      const baseQty = toBaseUnits(qty, unit || "g")
      return baseQty.mul(selectedItem.costPerBaseUnit).toDecimalPlaces(2).toNumber()
    } catch {
      return 0
    }
  }, [selectedItem, quantity, unit])

  function handleSelectItem(item: FormItem) {
    setSelectedItem(item)
    setShowSearch(false)
    setSearchQuery("")
    // Set default unit
    if (item.type === "dish") {
      setUnit("ea")
    } else {
      const defaults = UNIT_OPTIONS[item.baseUnitType]
      setUnit(defaults?.[0] ?? "g")
    }
  }

  function handleSubmit() {
    setError("")

    if (!venue) return setError("Please select a venue")
    if (!selectedItem) return setError("Please select an item")
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      return setError("Please enter a valid quantity")
    }
    if (!unit) return setError("Please select a unit")
    if (!reason) return setError("Please select a reason")

    startTransition(async () => {
      try {
        await createWasteEntry({
          date,
          venue: venue as "BURLEIGH" | "CURRUMBIN",
          dishId: selectedItem.type === "dish" ? selectedItem.id : null,
          ingredientId: selectedItem.type === "ingredient" ? selectedItem.id : null,
          itemName: selectedItem.name,
          quantity: Number(quantity),
          unit,
          reason: reason as typeof WASTE_REASONS[number]["value"],
          estimatedCost,
          notes: notes || null,
        })
        // Reset form
        setSelectedItem(null)
        setQuantity("")
        setUnit("")
        setReason("")
        setNotes("")
        router.refresh()
      } catch (err) {
        setError("Failed to save waste entry")
      }
    })
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-5">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Date + Venue row */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="waste-date">Date</Label>
            <Input
              id="waste-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Venue</Label>
            <Select value={venue} onValueChange={setVenue}>
              <SelectTrigger>
                <SelectValue placeholder="Select venue" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BURLEIGH">Burleigh</SelectItem>
                <SelectItem value="CURRUMBIN">Currumbin</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Item selector */}
        <div className="space-y-2">
          <Label>Item</Label>
          {selectedItem ? (
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
              <span className="flex-1 text-sm">{selectedItem.name}</span>
              <Badge variant="secondary" className="text-xs">
                {selectedItem.type === "dish" ? "Dish" : "Ingredient"}
              </Badge>
              <button
                onClick={() => {
                  setSelectedItem(null)
                  setUnit("")
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search dishes or ingredients..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowSearch(true)
                  }}
                  onFocus={() => setShowSearch(true)}
                  className="pl-9"
                />
              </div>
              {showSearch && (
                <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
                  {searchResults.map((item) => (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleSelectItem(item)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>{item.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {item.type === "dish" ? "Dish" : item.category}
                      </Badge>
                    </button>
                  ))}
                  {searchResults.length === 0 && (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      No items found
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quantity + Unit row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="waste-qty">Quantity</Label>
            <Input
              id="waste-qty"
              type="number"
              step="any"
              min="0"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Unit</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue placeholder="Unit" />
              </SelectTrigger>
              <SelectContent>
                {availableUnits.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <Label>Reason</Label>
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger>
              <SelectValue placeholder="Why is this being wasted?" />
            </SelectTrigger>
            <SelectContent>
              {WASTE_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Estimated Cost */}
        {estimatedCost > 0 && (
          <div className="rounded-lg border border-border bg-muted/50 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Estimated Cost</span>
              <span className="text-lg font-semibold text-red-600">
                ${estimatedCost.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="waste-notes">Notes (optional)</Label>
          <Textarea
            id="waste-notes"
            placeholder="Any additional details..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>

        {/* Submit */}
        <div className="flex gap-2">
          <Button onClick={handleSubmit} disabled={isPending}>
            <Plus className="mr-2 h-4 w-4" />
            {isPending ? "Saving..." : "Log Waste Entry"}
          </Button>
          <Button
            variant="outline"
            onClick={() => router.push("/wastage")}
          >
            View Dashboard
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
