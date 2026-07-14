"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import type { Allergen } from "@/generated/prisma"

export const ALLERGEN_OPTIONS: { value: Allergen; label: string; emoji: string }[] = [
  { value: "MILK", label: "Milk", emoji: "🥛" },
  { value: "EGG", label: "Egg", emoji: "🥚" },
  { value: "FISH", label: "Fish", emoji: "🐟" },
  { value: "SHELLFISH", label: "Shellfish", emoji: "🦐" },
  { value: "CRUSTACEAN", label: "Crustacean", emoji: "🦀" },
  { value: "MOLLUSC", label: "Mollusc", emoji: "🦑" },
  { value: "TREE_NUT", label: "Tree nut", emoji: "🌰" },
  { value: "PEANUT", label: "Peanut", emoji: "🥜" },
  { value: "WHEAT", label: "Wheat", emoji: "🌾" },
  { value: "GLUTEN", label: "Gluten", emoji: "🍞" },
  { value: "SOY", label: "Soy", emoji: "🫘" },
  { value: "SESAME", label: "Sesame", emoji: "🟫" },
  { value: "LUPIN", label: "Lupin", emoji: "🌼" },
  { value: "SULPHITE", label: "Sulphite", emoji: "🧪" },
]

export function AllergenPicker({
  value,
  onChange,
}: {
  value: Allergen[]
  onChange: (v: Allergen[]) => void
}) {
  const set = useMemo(() => new Set(value), [value])
  function toggle(a: Allergen) {
    const next = new Set(set)
    if (next.has(a)) next.delete(a)
    else next.add(a)
    onChange(Array.from(next))
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {ALLERGEN_OPTIONS.map((opt) => {
        const active = set.has(opt.value)
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
              active
                ? "border-red-text/30 bg-red-light text-red-text"
                : "border-border bg-white text-muted-foreground hover:bg-muted/50"
            )}
          >
            <span>{opt.emoji}</span>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export function AllergenPills({ allergens }: { allergens: string[] }) {
  if (allergens.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1">
      {allergens.map((a) => {
        const opt = ALLERGEN_OPTIONS.find((o) => o.value === a)
        return (
          <span
            key={a}
            className="inline-flex items-center gap-0.5 rounded-full border border-red-text/20 bg-red-light px-1.5 py-0 text-[10px] font-medium text-red-text"
          >
            {opt?.emoji} {opt?.label ?? a}
          </span>
        )
      })}
    </div>
  )
}
