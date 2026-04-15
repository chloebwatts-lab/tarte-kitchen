"use client"

import { useState, useMemo, useTransition, useRef, useEffect } from "react"
import Fuse from "fuse.js"
import Decimal from "decimal.js"
import { CheckCircle2, Search, X, Trash2 } from "lucide-react"
import { createWasteEntry } from "@/lib/actions/wastage"

// ─── Types ─────────────────────────────────────────────────────────────────

type DishItem = {
  id: string
  name: string
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

type PrepItem = {
  id: string
  name: string
  costPerGram: number
  costPerServe: number
  type: "prep"
}

type FormItem = DishItem | IngredientItem | PrepItem

interface Props {
  items: {
    dishes: DishItem[]
    ingredients: IngredientItem[]
    preps: PrepItem[]
  }
}

const UNIT_OPTIONS: Record<string, string[]> = {
  WEIGHT: ["g", "kg"],
  VOLUME: ["ml", "l"],
  COUNT: ["ea"],
}

const WASTE_REASONS = [
  { value: "OVERPRODUCTION", label: "Overproduction", icon: "📦" },
  { value: "SPOILAGE", label: "Spoilage", icon: "🦠" },
  { value: "EXPIRED", label: "Expired", icon: "📅" },
  { value: "DROPPED", label: "Dropped", icon: "💥" },
  { value: "STAFF_MEAL", label: "Staff Meal", icon: "🍽" },
  { value: "CUSTOMER_RETURN", label: "Return", icon: "↩️" },
  { value: "QUALITY_ISSUE", label: "Quality", icon: "⚠️" },
  { value: "OTHER", label: "Other", icon: "📝" },
] as const

// ─── Helpers ────────────────────────────────────────────────────────────────

function calcCost(item: FormItem, qty: number, unit: string): number {
  if (!qty || qty <= 0) return 0
  try {
    if (item.type === "dish") {
      return new Decimal(qty).mul(item.costPerUnit).toDecimalPlaces(2).toNumber()
    }
    if (item.type === "ingredient") {
      let baseQty = qty
      if (unit === "kg") baseQty = qty * 1000
      else if (unit === "l") baseQty = qty * 1000
      return new Decimal(baseQty).mul(item.costPerBaseUnit).toDecimalPlaces(2).toNumber()
    }
    if (item.type === "prep") {
      if (unit === "g") return new Decimal(qty).mul(item.costPerGram).toDecimalPlaces(2).toNumber()
      if (unit === "kg") return new Decimal(qty * 1000).mul(item.costPerGram).toDecimalPlaces(2).toNumber()
      return new Decimal(qty).mul(item.costPerServe).toDecimalPlaces(2).toNumber()
    }
  } catch { return 0 }
  return 0
}

function defaultUnit(item: FormItem): string {
  if (item.type === "dish") return "ea"
  if (item.type === "prep") return "g"
  return UNIT_OPTIONS[(item as IngredientItem).baseUnitType]?.[0] ?? "ea"
}

function availableUnits(item: FormItem): string[] {
  if (item.type === "dish") return ["ea"]
  if (item.type === "prep") return ["g", "kg", "serves"]
  return UNIT_OPTIONS[(item as IngredientItem).baseUnitType] ?? ["ea"]
}

function itemLabel(item: FormItem): string {
  if (item.type === "dish") return "Menu item"
  if (item.type === "prep") return "Prep"
  return (item as IngredientItem).category ?? "Ingredient"
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StaffWasteForm({ items }: Props) {
  const [isPending, startTransition] = useTransition()
  const searchRef = useRef<HTMLInputElement>(null)
  const searchWrapperRef = useRef<HTMLDivElement>(null)

  const [venue, setVenue] = useState<"BURLEIGH" | "CURRUMBIN" | "">("")
  const [selectedItem, setSelectedItem] = useState<FormItem | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [unit, setUnit] = useState("")
  const [reason, setReason] = useState<string>("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<{ name: string; cost: number } | null>(null)

  const allItems = useMemo<FormItem[]>(
    () => [...items.preps, ...items.ingredients, ...items.dishes],
    [items]
  )

  const fuse = useMemo(
    () => new Fuse(allItems, { keys: ["name"], threshold: 0.35, includeScore: true }),
    [allItems]
  )

  const searchResults = useMemo<FormItem[]>(() => {
    if (!searchQuery.trim()) return allItems.slice(0, 30)
    return fuse.search(searchQuery).map((r) => r.item).slice(0, 30)
  }, [searchQuery, fuse, allItems])

  const estimatedCost = useMemo(
    () => (selectedItem ? calcCost(selectedItem, Number(quantity), unit) : 0),
    [selectedItem, quantity, unit]
  )

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchWrapperRef.current && !searchWrapperRef.current.contains(e.target as Node)) {
        setShowSearch(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function handleSelectItem(item: FormItem) {
    setSelectedItem(item)
    setUnit(defaultUnit(item))
    setShowSearch(false)
    setSearchQuery("")
  }

  function handleSubmit() {
    setError("")
    if (!venue) return setError("Select a venue first")
    if (!selectedItem) return setError("Select an item")
    if (!quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      return setError("Enter a valid quantity")
    }
    if (!reason) return setError("Select a reason")
    startTransition(async () => {
      try {
        const today = new Date().toISOString().split("T")[0]
        await createWasteEntry({
          date: today,
          venue,
          dishId: selectedItem.type === "dish" ? selectedItem.id : null,
          ingredientId: selectedItem.type === "ingredient" ? selectedItem.id : null,
          itemName: selectedItem.name,
          quantity: Number(quantity),
          unit,
          reason: reason as typeof WASTE_REASONS[number]["value"],
          estimatedCost,
          recordedBy: "staff",
        })
        setSuccess({ name: selectedItem.name, cost: estimatedCost })
        setSelectedItem(null)
        setQuantity("")
        setUnit("")
        setReason("")
        setTimeout(() => setSuccess(null), 4000)
      } catch {
        setError("Failed to save — try again")
      }
    })
  }

  // Step indicator
  const step = !venue ? 1 : !selectedItem ? 2 : !quantity ? 3 : !reason ? 4 : 5

  return (
    <div className="flex flex-col min-h-svh bg-[#faf7f4]">

      {/* Header */}
      <header className="bg-[#1a1a1a] px-5 pt-12 pb-5 safe-area-top">
        <p className="text-[#c4a882] text-[10px] font-bold uppercase tracking-[0.2em] mb-0.5">
          Tarte Kitchen
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-white text-2xl font-bold tracking-tight">Log Waste</h1>
          <Trash2 className="h-5 w-5 text-[#c4a882] opacity-60" />
        </div>
      </header>

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 py-3 bg-[#faf7f4]">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              s < step ? "w-6 bg-[#1a1a1a]" : s === step ? "w-6 bg-[#c4a882]" : "w-1.5 bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="flex-1 px-4 space-y-3 pb-28">

        {/* Success banner */}
        {success && (
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-600 px-4 py-4 shadow-lg animate-in slide-in-from-top duration-300">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-white" />
            <div>
              <p className="text-sm font-semibold text-white">{success.name} logged</p>
              <p className="text-xs text-emerald-100 mt-0.5">
                {success.cost > 0 ? `$${success.cost.toFixed(2)} waste recorded` : "Logged successfully"}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-2xl bg-red-500 px-4 py-3 text-sm font-medium text-white shadow-sm">
            {error}
          </div>
        )}

        {/* Venue */}
        <section className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
          <div className="px-4 pt-3.5 pb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Venue</p>
            {step === 1 && <span className="text-[10px] font-medium text-[#c4a882]">Step 1</span>}
          </div>
          <div className="grid grid-cols-2 gap-0 border-t border-gray-50">
            {(["BURLEIGH", "CURRUMBIN"] as const).map((v, i) => (
              <button
                key={v}
                onClick={() => setVenue(v)}
                className={`py-4 text-sm font-bold tracking-wide transition-all ${
                  i === 0 ? "border-r border-gray-50" : ""
                } ${
                  venue === v
                    ? "bg-[#1a1a1a] text-white"
                    : "bg-white text-gray-400 active:bg-gray-50"
                }`}
              >
                {v.charAt(0) + v.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </section>

        {/* Item search */}
        <section className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
          <div className="px-4 pt-3.5 pb-1.5 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Item</p>
            {step === 2 && <span className="text-[10px] font-medium text-[#c4a882]">Step 2</span>}
          </div>

          {selectedItem ? (
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-gray-50">
              <div>
                <p className="text-sm font-semibold text-gray-900">{selectedItem.name}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{itemLabel(selectedItem)}</p>
              </div>
              <button
                onClick={() => { setSelectedItem(null); setUnit(""); setQuantity("") }}
                className="rounded-full bg-gray-100 p-2 text-gray-400 active:bg-gray-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div ref={searchWrapperRef} className="relative border-t border-gray-50">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300 pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search ingredients, preps, dishes..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true) }}
                onFocus={() => setShowSearch(true)}
                className="w-full bg-transparent py-3.5 pl-11 pr-4 text-sm text-gray-900 outline-none placeholder:text-gray-300"
              />
              {showSearch && (
                <div className="absolute left-0 right-0 top-full z-20 max-h-64 overflow-y-auto bg-white border-t border-gray-100 shadow-xl rounded-b-2xl">
                  {searchResults.length === 0 ? (
                    <p className="px-4 py-4 text-sm text-gray-400">No items found</p>
                  ) : (
                    searchResults.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        onMouseDown={() => handleSelectItem(item)}
                        className="flex w-full items-center justify-between px-4 py-3 text-left border-b border-gray-50 last:border-0 active:bg-gray-50"
                      >
                        <span className="text-sm text-gray-900">{item.name}</span>
                        <span className="ml-3 shrink-0 rounded-full bg-gray-50 px-2.5 py-0.5 text-[11px] text-gray-400">
                          {itemLabel(item)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Quantity + Unit */}
        {selectedItem && (
          <section className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
            <div className="px-4 pt-3.5 pb-1.5 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Quantity</p>
              {step === 3 && <span className="text-[10px] font-medium text-[#c4a882]">Step 3</span>}
            </div>
            <div className="flex items-stretch border-t border-gray-50">
              <input
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                placeholder="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="flex-1 bg-transparent py-4 px-4 text-3xl font-bold text-gray-900 outline-none placeholder:text-gray-200 [&::-webkit-inner-spin-button]:appearance-none"
              />
              {availableUnits(selectedItem).length > 1 ? (
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="border-l border-gray-50 bg-transparent px-4 text-base font-semibold text-gray-500 outline-none w-20 text-center appearance-none"
                >
                  {availableUnits(selectedItem).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center border-l border-gray-50 px-4 text-base font-semibold text-gray-400">
                  {unit}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Reason */}
        {selectedItem && quantity && Number(quantity) > 0 && (
          <section className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100/80">
            <div className="px-4 pt-3.5 pb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-gray-400">Reason</p>
              {step === 4 && <span className="text-[10px] font-medium text-[#c4a882]">Step 4</span>}
            </div>
            <div className="grid grid-cols-4 gap-1.5 px-3 pb-3">
              {WASTE_REASONS.map((r) => (
                <button
                  key={r.value}
                  onClick={() => setReason(r.value)}
                  className={`flex flex-col items-center gap-1 rounded-xl py-2.5 px-1 text-center transition-all ${
                    reason === r.value
                      ? "bg-[#1a1a1a] text-white shadow-sm"
                      : "bg-gray-50 text-gray-500 active:bg-gray-100"
                  }`}
                >
                  <span className="text-base leading-none">{r.icon}</span>
                  <span className="text-[10px] font-medium leading-tight">{r.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Cost preview */}
        {estimatedCost > 0 && (
          <div className="bg-[#1a1a1a] rounded-2xl px-5 py-4 flex items-center justify-between shadow">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Est. cost</span>
            <span className="text-xl font-bold text-[#c4a882]">${estimatedCost.toFixed(2)}</span>
          </div>
        )}
      </div>

      {/* Sticky submit */}
      <div className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-[#faf7f4] from-70% to-transparent px-4 pb-8 pt-6">
        <button
          onClick={handleSubmit}
          disabled={isPending || step < 5}
          className={`w-full rounded-2xl py-4 text-sm font-bold tracking-wide shadow-lg transition-all active:scale-[0.98] ${
            step >= 5
              ? "bg-[#1a1a1a] text-white"
              : "bg-gray-200 text-gray-400 shadow-none"
          } disabled:opacity-50`}
        >
          {isPending ? "Saving..." : "Log Waste"}
        </button>
      </div>
    </div>
  )
}
