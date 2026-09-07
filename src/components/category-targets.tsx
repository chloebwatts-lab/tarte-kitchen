"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Target, Loader2 } from "lucide-react"
import { setCategoryTarget } from "@/lib/actions/menu-pricing"
import type { MenuCategory } from "@/generated/prisma/client"

const LABELS: Record<MenuCategory, string> = {
  BREAKFAST: "Breakfast", LUNCH: "Lunch", SIDES: "Sides", DRINKS: "Drinks", KIDS: "Kids",
  DESSERT: "Dessert", PASTRY: "Pastry", SPECIAL: "Special", OTHER: "Other",
}

export function CategoryTargets({ targets }: { targets: Record<MenuCategory, number> }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [saving, setSaving] = useState<string | null>(null)

  const save = (category: MenuCategory, raw: string) => {
    const n = Number(raw)
    if (!Number.isFinite(n) || n === targets[category]) return
    setSaving(category)
    startTransition(async () => {
      await setCategoryTarget(category, n)
      setSaving(null)
      router.refresh()
    })
  }

  return (
    <details className="rounded-lg border border-border bg-muted/30 px-4 py-2 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium">
        <Target className="h-4 w-4 text-muted-foreground" />
        Food cost targets by category
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          drive the recommended price column
        </span>
      </summary>
      <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-2 sm:grid-cols-5">
        {(Object.keys(LABELS) as MenuCategory[]).map((c) => (
          <label key={c} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{LABELS[c]}</span>
            <span className="flex items-center gap-1">
              <input
                type="number"
                min={1}
                max={99}
                step={0.5}
                defaultValue={targets[c]}
                disabled={pending && saving === c}
                onBlur={(e) => save(c, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                }}
                className="w-16 rounded border border-border bg-background px-2 py-1 text-right tabular-nums"
              />
              {saving === c ? <Loader2 className="h-3 w-3 animate-spin" /> : <span className="text-xs">%</span>}
            </span>
          </label>
        ))}
      </div>
    </details>
  )
}
