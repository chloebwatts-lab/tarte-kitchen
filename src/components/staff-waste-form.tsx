"use client"

import { useState, useMemo, useTransition } from "react"
import { CheckCircle2, Search, X } from "lucide-react"
import { createWasteEntry } from "@/lib/actions/wastage"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { KitchenButton } from "@/components/kitchen/KitchenButton"

// ─── Types ─────────────────────────────────────────────────────────────────

type DishItem = {
  id: string
  name: string
  costPerUnit: number
  type: "dish"
  category: string
  recentUseCount?: number
}

type IngredientItem = {
  id: string
  name: string
  costPerBaseUnit: number
  type: "ingredient"
  category: string
  baseUnitType: string
  gramsPerUnit: number | null
  recentUseCount?: number
}

type PrepItem = {
  id: string
  name: string
  costPerGram: number
  costPerServe: number
  type: "prep"
  // "serves" / "g" / "ml" / "l" — what a batch of the recipe yields.
  // Used to decide whether the waste form should offer a "serves" unit at
  // all: a 750g batch of hollandaise is *not* 750 serves.
  yieldUnit?: string
  recentUseCount?: number
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
      return Math.round(qty * item.costPerUnit * 100) / 100
    }
    if (item.type === "ingredient") {
      // COUNT ingredient entered by weight: convert grams → ea via gramsPerUnit
      if (item.baseUnitType === "COUNT" && (unit === "g" || unit === "kg")) {
        if (!item.gramsPerUnit || item.gramsPerUnit <= 0) return 0
        const grams = unit === "kg" ? qty * 1000 : qty
        const eaEquivalent = grams / item.gramsPerUnit
        return Math.round(eaEquivalent * item.costPerBaseUnit * 100) / 100
      }
      let baseQty = qty
      if (unit === "kg") baseQty = qty * 1000
      else if (unit === "l") baseQty = qty * 1000
      return Math.round(baseQty * item.costPerBaseUnit * 100) / 100
    }
    if (item.type === "prep") {
      if (unit === "g" || unit === "ml") return Math.round(qty * item.costPerGram * 100) / 100
      if (unit === "kg" || unit === "l") return Math.round(qty * 1000 * item.costPerGram * 100) / 100
      return Math.round(qty * item.costPerServe * 100) / 100
    }
  } catch { return 0 }
  return 0
}

function defaultUnit(item: FormItem): string {
  if (item.type === "dish") return "ea"
  if (item.type === "prep") {
    // Only default to "serves" when the recipe actually yields discrete
    // serves — otherwise go with the yield unit (g / ml) so a "1" entry
    // means 1 gram, not $0.01 of a 750g hollandaise batch.
    if (item.yieldUnit === "serves") return "serves"
    if (item.yieldUnit === "ml" || item.yieldUnit === "l") return "ml"
    return "g"
  }
  return UNIT_OPTIONS[(item as IngredientItem).baseUnitType]?.[0] ?? "ea"
}

function availableUnits(item: FormItem): string[] {
  if (item.type === "dish") return ["ea"]
  if (item.type === "prep") {
    if (item.yieldUnit === "serves") return ["serves", "g", "kg"]
    if (item.yieldUnit === "ml" || item.yieldUnit === "l") return ["ml", "l", "g", "kg"]
    return ["g", "kg"]
  }
  const ing = item as IngredientItem
  const base = UNIT_OPTIONS[ing.baseUnitType] ?? ["ea"]
  // COUNT ingredients with a known weight-per-unit can also be entered by grams
  if (ing.baseUnitType === "COUNT" && ing.gramsPerUnit && ing.gramsPerUnit > 0) {
    return [...base, "g", "kg"]
  }
  return base
}

function itemLabel(item: FormItem): string {
  if (item.type === "dish") return "Menu item"
  if (item.type === "prep") return "Prep"
  return (item as IngredientItem).category ?? "Ingredient"
}

// ─── Component ─────────────────────────────────────────────────────────────

export function StaffWasteForm({ items }: Props) {
  const [isPending, startTransition] = useTransition()

  const [venue, setVenue] = useState<"BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN" | "">("")
  const [selectedItem, setSelectedItem] = useState<FormItem | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [quantity, setQuantity] = useState("")
  const [unit, setUnit] = useState("")
  const [reason, setReason] = useState<string>("")
  const [error, setError] = useState("")
  const [success, setSuccess] = useState<{ name: string; cost: number } | null>(null)

  // Combine all items, sorted so the most-wasted-in-last-30-days float to
  // the top — so a staffer typing "h" hits "Hollandaise" before "Herbs".
  const allItems = useMemo<FormItem[]>(() => {
    const combined: FormItem[] = [...items.preps, ...items.ingredients, ...items.dishes]
    return combined.sort((a, b) => {
      const ra = a.recentUseCount ?? 0
      const rb = b.recentUseCount ?? 0
      if (ra !== rb) return rb - ra
      return a.name.localeCompare(b.name)
    })
  }, [items])

  // Substring + prefix-boost search. Items whose name *starts* with the
  // query rank above items that merely contain it; within each bucket the
  // frequency order from allItems is preserved.
  const searchResults = useMemo<FormItem[]>(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allItems.slice(0, 30)
    const prefix: FormItem[] = []
    const contains: FormItem[] = []
    for (const item of allItems) {
      const name = item.name.toLowerCase()
      if (name.startsWith(q)) prefix.push(item)
      else if (name.includes(q)) contains.push(item)
    }
    return [...prefix, ...contains].slice(0, 30)
  }, [searchQuery, allItems])

  const estimatedCost = useMemo(
    () => (selectedItem ? calcCost(selectedItem, Number(quantity), unit) : 0),
    [selectedItem, quantity, unit]
  )

  function handleSelectItem(item: FormItem) {
    setSelectedItem(item)
    setUnit(defaultUnit(item))
    setSearchOpen(false)
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
      } catch (e) {
        const msg = (e instanceof Error ? e.message : String(e)) || ''
        // Server action hash changes on every deploy. If the browser has
        // a stale bundle, the POST returns 'Failed to find Server Action'.
        // Reload once so the user gets fresh JS and can retry.
        if (msg.includes('Server Action') || msg.includes('NEXT_REDIRECT') === false && /action|deployment/i.test(msg)) {
          setError('Updating — reloading the app...')
          setTimeout(() => window.location.reload(), 800)
          return
        }
        console.error('Waste save failed:', e)
        setError('Failed to save — try again')
      }
    })
  }

  const step = !venue ? 1 : !selectedItem ? 2 : !quantity ? 3 : !reason ? 4 : 5
  const ready = step >= 5

  const venueOptions: { v: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"; label: string; sub: string }[] = [
    { v: "BURLEIGH", label: "Tarte Bakery", sub: "Burleigh Heads" },
    { v: "BEACH_HOUSE", label: "Beach House", sub: "Currumbin" },
    { v: "TEA_GARDEN", label: "Tea Garden", sub: "Currumbin" },
  ]

  return (
    <div className="space-y-6 pb-32">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--tk-line)] pb-4">
        <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
          Step {Math.min(step, 4)} of 4
        </div>
        <KitchenLogo size={0.9} />
        <div className="w-[88px]" />
      </div>

      {/* Title */}
      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Log waste
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Quick walk-up record of anything binned. Pick a venue, find the
          item, enter how much was lost and why.
        </p>
      </div>

      {success && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-5 py-4"
          style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
        >
          <CheckCircle2 className="h-6 w-6 shrink-0" />
          <div>
            <div className="text-[15px] font-semibold">{success.name} logged</div>
            <div className="mt-0.5 text-[13px]">
              {success.cost > 0 ? `$${success.cost.toFixed(2)} waste recorded` : "Saved."}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-[14px] px-5 py-3 text-[14px] font-semibold"
          style={{ background: "var(--tk-warn-soft)", color: "var(--tk-warn)" }}
        >
          {error}
        </div>
      )}

      {/* Venue */}
      <section>
        <SectionLabel n={1} active={step === 1} done={!!venue}>
          Venue
        </SectionLabel>
        <div className="grid gap-3 md:grid-cols-3">
          {venueOptions.map(({ v, label, sub }) => {
            const selected = venue === v
            return (
              <button
                key={v}
                type="button"
                onClick={() => setVenue(v)}
                className="rounded-[18px] border bg-white px-5 py-4 text-left transition active:scale-[0.997]"
                style={{
                  borderColor: selected ? "var(--tk-charcoal)" : "var(--tk-line)",
                  background: selected ? "var(--tk-charcoal)" : "white",
                  color: selected ? "white" : "var(--tk-charcoal)",
                  boxShadow: selected ? "0 4px 14px rgba(60,62,63,0.14)" : "none",
                }}
              >
                <div
                  className="tk-display leading-tight"
                  style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}
                >
                  {label}
                </div>
                <div
                  className="mt-1 text-[13px]"
                  style={{ color: selected ? "rgba(255,255,255,0.78)" : "var(--tk-ink-soft)" }}
                >
                  {sub}
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {/* Item */}
      {venue && (
        <section>
          <SectionLabel n={2} active={step === 2} done={!!selectedItem}>
            Item
          </SectionLabel>
          {selectedItem ? (
            <div className="flex items-center justify-between gap-3 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4">
              <div className="min-w-0">
                <div
                  className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {selectedItem.name}
                </div>
                <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
                  {itemLabel(selectedItem)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedItem(null)
                  setUnit("")
                  setQuantity("")
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] active:scale-[0.95]"
                aria-label="Clear item"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
              <div className="relative border-b border-[var(--tk-line)]">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
                <input
                  type="text"
                  placeholder="Search ingredients, preps, dishes…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setSearchOpen(true)
                  }}
                  onFocus={() => setSearchOpen(true)}
                  className="w-full bg-transparent py-4 pl-12 pr-4 text-[16px] text-[var(--tk-ink)] outline-none placeholder:text-[var(--tk-ink-mute)]"
                />
              </div>
              {searchOpen && (
                <div className="max-h-[320px] overflow-y-auto">
                  {searchResults.length === 0 ? (
                    <p className="px-5 py-5 text-[14px] text-[var(--tk-ink-soft)]">
                      No items found
                    </p>
                  ) : (
                    searchResults.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onClick={() => handleSelectItem(item)}
                        className="flex w-full items-center justify-between border-b border-[var(--tk-line)] px-5 py-3.5 text-left transition last:border-0 active:bg-[var(--tk-bg)]"
                      >
                        <span className="text-[15px] text-[var(--tk-charcoal)]">
                          {item.name}
                        </span>
                        <span
                          className="ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-semibold uppercase tracking-wider"
                          style={{
                            background: "var(--tk-sage-soft)",
                            color: "var(--tk-done)",
                            letterSpacing: "0.06em",
                          }}
                        >
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
      )}

      {/* Quantity */}
      {selectedItem && (
        <section>
          <SectionLabel n={3} active={step === 3} done={!!quantity && Number(quantity) > 0}>
            Quantity
          </SectionLabel>
          <div className="flex items-stretch overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              min="0"
              placeholder="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="tk-display flex-1 bg-transparent px-5 py-4 text-[40px] font-bold leading-none text-[var(--tk-charcoal)] outline-none placeholder:text-[var(--tk-ink-mute)]"
              style={{
                WebkitAppearance: "none",
                MozAppearance: "textfield",
                letterSpacing: "-0.025em",
              } as React.CSSProperties}
            />
            {availableUnits(selectedItem).length > 1 ? (
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-24 border-l border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 text-[18px] font-semibold text-[var(--tk-charcoal)] outline-none"
              >
                {availableUnits(selectedItem).map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex items-center border-l border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 text-[18px] font-semibold text-[var(--tk-charcoal)]">
                {unit}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Reason */}
      {selectedItem && quantity && Number(quantity) > 0 && (
        <section>
          <SectionLabel n={4} active={step === 4} done={!!reason}>
            Reason
          </SectionLabel>
          <div className="grid gap-2.5 sm:grid-cols-4">
            {WASTE_REASONS.map((r) => {
              const selected = reason === r.value
              return (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setReason(r.value)}
                  className="flex min-h-[80px] flex-col items-center justify-center gap-1.5 rounded-[14px] border px-2 py-3 text-center transition active:scale-[0.98]"
                  style={{
                    borderColor: selected ? "var(--tk-charcoal)" : "var(--tk-line)",
                    background: selected ? "var(--tk-charcoal)" : "white",
                    color: selected ? "white" : "var(--tk-ink)",
                  }}
                >
                  <span className="text-[22px] leading-none">{r.icon}</span>
                  <span className="text-[12px] font-semibold leading-tight">
                    {r.label}
                  </span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {/* Cost preview */}
      {estimatedCost > 0 && (
        <div
          className="flex items-center justify-between rounded-[16px] px-6 py-4"
          style={{ background: "var(--tk-sage)", color: "white" }}
        >
          <span
            className="tk-caps"
            style={{ color: "rgba(255,255,255,0.8)", letterSpacing: "0.14em" }}
          >
            Estimated cost
          </span>
          <span
            className="tk-display tabular-nums leading-none"
            style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em" }}
          >
            ${estimatedCost.toFixed(2)}
          </span>
        </div>
      )}

      {/* Sticky submit */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-[var(--tk-line)]"
        style={{
          background: "rgba(246,245,242,0.94)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="mx-auto flex max-w-[1194px] items-center justify-between gap-4 px-6 py-3 md:px-10">
          <div className="text-[13px] text-[var(--tk-ink-soft)]">
            {ready ? (
              <span>
                Ready to log{" "}
                <span className="font-semibold text-[var(--tk-charcoal)]">
                  ${estimatedCost.toFixed(2)}
                </span>
              </span>
            ) : (
              <span>
                {!venue && "Pick a venue to start"}
                {venue && !selectedItem && "Now find the item"}
                {selectedItem && (!quantity || Number(quantity) <= 0) && "Enter quantity"}
                {selectedItem && quantity && Number(quantity) > 0 && !reason && "Pick a reason"}
              </span>
            )}
          </div>
          <KitchenButton
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={isPending || !ready}
          >
            {isPending ? "Saving…" : "Log waste"}
          </KitchenButton>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({
  n,
  active,
  done,
  children,
}: {
  n: number
  active: boolean
  done: boolean
  children: React.ReactNode
}) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
        style={{
          background: done
            ? "var(--tk-done-soft)"
            : active
              ? "var(--tk-charcoal)"
              : "var(--tk-bg)",
          color: done
            ? "var(--tk-done)"
            : active
              ? "white"
              : "var(--tk-ink-mute)",
        }}
      >
        {n}
      </span>
      <span
        className="tk-caps"
        style={{ color: "var(--tk-ink-soft)", letterSpacing: "0.12em" }}
      >
        {children}
      </span>
    </div>
  )
}
