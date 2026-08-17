"use client"

import { useMemo, useState } from "react"
import { ChevronDown, Search } from "lucide-react"
import type { PortionGuideDish } from "@/lib/actions/portion-guide"

const CATEGORY_ORDER = [
  "BREAKFAST",
  "LUNCH",
  "SIDES",
  "KIDS",
  "PASTRY",
  "DESSERT",
  "SPECIAL",
  "OTHER",
  "DRINKS",
]

const CATEGORY_LABEL: Record<string, string> = {
  BREAKFAST: "Breakfast",
  LUNCH: "Lunch",
  SIDES: "Sides",
  KIDS: "Kids",
  PASTRY: "Pastry",
  DESSERT: "Dessert",
  SPECIAL: "Specials",
  OTHER: "Other",
  DRINKS: "Drinks",
}

function fmtQty(quantity: number, unit: string): string {
  const rounded =
    Math.abs(quantity - Math.round(quantity)) < 0.005
      ? String(Math.round(quantity))
      : String(Number(quantity.toFixed(2)))
  const u = unit.toLowerCase().trim()
  if (u === "serve" || u === "serves") {
    return `${rounded} ${quantity === 1 ? "serve" : "serves"}`
  }
  return `${rounded} ${unit}`
}

function fmtPlated(grams: number): string {
  if (grams >= 1000) {
    const kg = grams / 1000
    return `${kg % 1 === 0 ? kg : kg.toFixed(2)} kg`
  }
  return `${grams} g`
}

export function PortionGuide({ dishes }: { dishes: PortionGuideDish[] }) {
  const [query, setQuery] = useState("")
  const [openId, setOpenId] = useState<string | null>(null)

  const groups = useMemo(() => {
    const q = query.toLowerCase().trim()
    const matches = q
      ? dishes.filter(
          (d) =>
            d.name.toLowerCase().includes(q) ||
            d.components.some((c) => c.item.toLowerCase().includes(q))
        )
      : dishes

    const byCategory = new Map<string, PortionGuideDish[]>()
    for (const d of matches) {
      const list = byCategory.get(d.menuCategory) ?? []
      list.push(d)
      byCategory.set(d.menuCategory, list)
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map((c) => ({
      category: c,
      label: CATEGORY_LABEL[c] ?? c,
      dishes: byCategory.get(c)!,
    }))
  }, [dishes, query])

  const shown = groups.reduce((n, g) => n + g.dishes.length, 0)

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--tk-ink-mute)]" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a dish or an ingredient: bagel, salmon, avocado…"
          className="w-full rounded-[16px] border border-[var(--tk-line)] bg-white py-4 pl-12 pr-4 text-[17px] text-[var(--tk-charcoal)] outline-none placeholder:text-[var(--tk-ink-mute)] focus:border-[var(--tk-sage)]"
        />
      </div>

      {shown === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center text-[14px] text-[var(--tk-ink-soft)]">
          Nothing matches that. Weights come from the recipe cards, so a dish
          with no costed ingredients will not appear here.
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.category} className="space-y-2.5">
            <div className="flex items-baseline gap-2 px-1">
              <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
                {g.label}
              </div>
              <div className="text-[12px] tabular-nums text-[var(--tk-ink-mute)]">
                {g.dishes.length}
              </div>
            </div>
            {g.dishes.map((d) => (
              <DishRow
                key={d.dishId}
                dish={d}
                open={openId === d.dishId}
                onToggle={() => setOpenId(openId === d.dishId ? null : d.dishId)}
              />
            ))}
          </div>
        ))
      )}
    </div>
  )
}

function DishRow({
  dish,
  open,
  onToggle,
}: {
  dish: PortionGuideDish
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition active:scale-[0.997]"
      >
        <div className="min-w-0 flex-1">
          <div
            className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]"
            style={{ letterSpacing: "-0.01em" }}
          >
            {dish.name}
          </div>
          <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
            {dish.platedGrams > 0
              ? `${fmtPlated(dish.platedGrams)} on the plate`
              : "No weighed items"}
            {dish.countLines > 0 &&
              ` · ${dish.countLines} item${dish.countLines === 1 ? "" : "s"} by count`}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[var(--tk-ink-mute)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-3">
          {dish.components.map((c, i) => (
            <div
              key={`${c.item}-${i}`}
              className="flex items-baseline justify-between gap-3 border-b border-[var(--tk-line)] py-2.5 last:border-b-0"
            >
              <span className="text-[15px] leading-snug text-[var(--tk-charcoal)]">
                {c.item}
                {c.isPrep && (
                  <span
                    className="ml-2 rounded-[4px] px-1.5 py-0.5 align-[1px] text-[10px] font-semibold uppercase tracking-wide"
                    style={{
                      background: "var(--tk-line)",
                      color: "var(--tk-ink-soft)",
                    }}
                  >
                    prep
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[16px] font-semibold tabular-nums text-[var(--tk-charcoal)]">
                {fmtQty(c.quantity, c.unit)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
