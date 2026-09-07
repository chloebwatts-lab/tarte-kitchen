"use client"

import { useState, useTransition } from "react"
import { ArrowUp, ArrowDown, Check, Loader2 } from "lucide-react"
import { applyRecommendedPrice } from "@/lib/actions/menu-pricing"
import { recommend } from "@/lib/menu-pricing"
import { cn } from "@/lib/utils"

interface Props {
  dishId: string
  totalCost: number
  sellingPrice: number
  foodCostPct: number
  targetPct: number
  onApplied?: () => void
  compact?: boolean
}

/**
 * "$26.50, up $2.50" with an Apply button when the dish misses its
 * category's food-cost target; a quiet tick when it already meets it.
 */
export function RecommendedPrice({ dishId, totalCost, sellingPrice, foodCostPct, targetPct, onApplied, compact }: Props) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const r = recommend(totalCost, sellingPrice, foodCostPct, targetPct)

  if (r.recommendedPrice === null) {
    return <span className="text-xs text-muted-foreground">no cost</span>
  }
  if (r.onTarget) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={`Meets ${targetPct}% target`}>
        <Check className="h-3 w-3" /> on target
      </span>
    )
  }
  const up = (r.deltaDollars ?? 0) > 0
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
      <span className="text-sm font-semibold tabular-nums">${r.recommendedPrice.toFixed(2)}</span>
      <span className={cn("inline-flex items-center text-xs tabular-nums", up ? "text-red-600 dark:text-red-400" : "text-green-text dark:text-green-400")}>
        {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(r.deltaDollars ?? 0).toFixed(2)}
      </span>
      {!compact && (
        <button
          type="button"
          disabled={pending}
          title={`Set to $${r.recommendedPrice.toFixed(2)} (${r.resultingFoodCostPct}% food cost, target ${targetPct}%)`}
          onClick={(e) => {
            e.stopPropagation()
            setError(null)
            startTransition(async () => {
              const res = await applyRecommendedPrice(dishId)
              if (!res.ok) setError(res.reason)
              else onApplied?.()
            })
          }}
          className="rounded border border-border px-2 py-0.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Apply"}
        </button>
      )}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  )
}
