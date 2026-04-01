"use client"

import { useState, useMemo, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Search, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PreparationForm } from "@/components/preparation-form"
import { updatePreparationQuick } from "@/lib/actions/preparations"
import { cn } from "@/lib/utils"

type Preparation = {
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
    ingredient: { id: string; name: string; category: string; baseUnitType: string; purchasePrice: number; baseUnitsPerPurchase: number; wastePercentage: number } | null
    subPreparationId: string | null
    subPreparation: { id: string; name: string; category: string; batchCost: number; yieldQuantity: number; yieldUnit: string; yieldWeightGrams: number } | null
    quantity: number
    unit: string
    lineCost: number
    sortOrder: number
  }>
}

const CATEGORIES = [
  "ALL",
  "SAUCE",
  "DRESSING",
  "MIX",
  "BASE",
  "PRESERVED",
  "PASTRY",
  "BREAD",
  "COMPONENT",
  "GARNISH",
  "OTHER",
] as const

const CATEGORY_LABELS: Record<string, string> = {
  ALL: "All",
  SAUCE: "Sauce",
  DRESSING: "Dressing",
  MIX: "Mix",
  BASE: "Base",
  PRESERVED: "Preserved",
  PASTRY: "Pastry",
  BREAD: "Bread",
  COMPONENT: "Component",
  GARNISH: "Garnish",
  OTHER: "Other",
}

const CATEGORY_COLORS: Record<string, string> = {
  SAUCE: "bg-red-50 border-red-100 dark:bg-red-950/20 dark:border-red-900/30",
  DRESSING: "bg-lime-50 border-lime-100 dark:bg-lime-950/20 dark:border-lime-900/30",
  MIX: "bg-violet-50 border-violet-100 dark:bg-violet-950/20 dark:border-violet-900/30",
  BASE: "bg-amber-50 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30",
  PRESERVED: "bg-orange-50 border-orange-100 dark:bg-orange-950/20 dark:border-orange-900/30",
  PASTRY: "bg-pink-50 border-pink-100 dark:bg-pink-950/20 dark:border-pink-900/30",
  BREAD: "bg-yellow-50 border-yellow-100 dark:bg-yellow-950/20 dark:border-yellow-900/30",
  COMPONENT: "bg-sky-50 border-sky-100 dark:bg-sky-950/20 dark:border-sky-900/30",
  GARNISH: "bg-emerald-50 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30",
  OTHER: "bg-gray-50 border-gray-100 dark:bg-gray-950/20 dark:border-gray-900/30",
}

const CATEGORY_BADGE_COLORS: Record<string, string> = {
  SAUCE: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  DRESSING: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-300",
  MIX: "bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-300",
  BASE: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300",
  PRESERVED: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  PASTRY: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  BREAD: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300",
  COMPONENT: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300",
  GARNISH: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300",
  OTHER: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300",
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

// Inline editable numeric field for prep cards
function InlinePrepField({
  value,
  suffix,
  prefix,
  step,
  prepId,
  field,
  onSaved,
}: {
  value: number
  suffix?: string
  prefix?: string
  step?: string
  prepId: string
  field: "yieldQuantity" | "yieldWeightGrams"
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [isPending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const save = () => {
    const num = parseFloat(draft)
    if (isNaN(num) || num < 0) {
      setDraft(String(value))
      setEditing(false)
      return
    }
    if (num === value) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      await updatePreparationQuick(prepId, { [field]: num })
      onSaved()
      setEditing(false)
    })
  }

  const cancel = () => {
    setDraft(String(value))
    setEditing(false)
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {prefix}
        <Input
          ref={inputRef}
          type="number"
          step={step || "1"}
          min="0"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save()
            if (e.key === "Escape") cancel()
          }}
          onBlur={save}
          className="h-6 w-20 px-1 text-xs"
          disabled={isPending}
        />
        {suffix}
        {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
      </span>
    )
  }

  return (
    <button
      type="button"
      className="hover:text-primary hover:underline decoration-dashed underline-offset-2"
      onClick={(e) => {
        e.stopPropagation()
        setEditing(true)
      }}
    >
      {prefix}{value.toLocaleString()}{suffix}
    </button>
  )
}

interface PreparationsGridProps {
  preparations: Preparation[]
  initialSearch: string
  initialCategory: string
}

export function PreparationsGrid({
  preparations,
  initialSearch,
  initialCategory,
}: PreparationsGridProps) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [category, setCategory] = useState(initialCategory)
  const [editingPrep, setEditingPrep] = useState<Preparation | null>(null)

  const handleSaved = () => router.refresh()

  const filtered = useMemo(() => {
    let result = preparations

    if (search) {
      const q = search.toLowerCase()
      result = result.filter((p) => p.name.toLowerCase().includes(q))
    }

    if (category !== "ALL") {
      result = result.filter((p) => p.category === category)
    }

    return result
  }, [preparations, search, category])

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search preparations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Category filter tabs */}
      <Tabs value={category} onValueChange={setCategory}>
        <TabsList className="flex h-auto flex-wrap gap-1">
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat} className="text-xs">
              {CATEGORY_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <p className="text-sm text-muted-foreground">No preparations found</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((prep) => (
            <Card
              key={prep.id}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                CATEGORY_COLORS[prep.category] || CATEGORY_COLORS.OTHER
              )}
              onClick={() => setEditingPrep(prep)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-snug text-foreground">
                    {prep.name}
                  </h3>
                  <Badge
                    className={cn(
                      "shrink-0 border-0 text-[10px]",
                      CATEGORY_BADGE_COLORS[prep.category] || CATEGORY_BADGE_COLORS.OTHER
                    )}
                  >
                    {CATEGORY_LABELS[prep.category] || prep.category}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Makes{" "}
                  <InlinePrepField
                    value={prep.yieldQuantity}
                    suffix={` ${prep.yieldUnit}`}
                    prepId={prep.id}
                    field="yieldQuantity"
                    onSaved={handleSaved}
                  />
                  {prep.yieldWeightGrams > 0 && (
                    <>
                      {" ("}
                      <InlinePrepField
                        value={prep.yieldWeightGrams}
                        suffix="g"
                        prepId={prep.id}
                        field="yieldWeightGrams"
                        onSaved={handleSaved}
                      />
                      {")"}
                    </>
                  )}
                </p>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Batch
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(prep.batchCost)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Per serve
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      {formatCurrency(prep.costPerServe)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Per gram
                    </p>
                    <p className="text-sm font-semibold text-foreground">
                      ${prep.costPerGram.toFixed(4)}
                    </p>
                  </div>
                </div>
                <div className="mt-3 text-[11px] text-muted-foreground">
                  {prep.items.length} ingredient{prep.items.length !== 1 ? "s" : ""}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      {editingPrep && (
        <PreparationForm
          preparation={editingPrep}
          open={true}
          onOpenChange={(open) => {
            if (!open) setEditingPrep(null)
          }}
        />
      )}
    </div>
  )
}
