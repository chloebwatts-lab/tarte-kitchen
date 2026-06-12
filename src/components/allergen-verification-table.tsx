"use client"

import { useMemo, useState, useTransition } from "react"
import { Search, Loader2, CheckCircle2, Bot, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { AllergenPicker } from "@/components/allergen-picker"
import {
  verifyIngredientAllergens,
  type AllergenVerificationRow,
  type AllergenProgress,
} from "@/lib/actions/allergen-verification"
import type { Allergen } from "@/generated/prisma"

type Filter = "needs-review" | "verified" | "all"

const FILTERS: { value: Filter; label: string }[] = [
  { value: "needs-review", label: "Needs review" },
  { value: "verified", label: "Verified" },
  { value: "all", label: "All" },
]

export function AllergenVerificationTable({
  rows,
  progress,
}: {
  rows: AllergenVerificationRow[]
  progress: AllergenProgress
}) {
  const [filter, setFilter] = useState<Filter>("needs-review")
  const [search, setSearch] = useState("")

  const needsReviewCount = useMemo(
    () => rows.filter((r) => r.confident !== true).length,
    [rows]
  )

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter === "needs-review" && r.confident === true) return false
      if (filter === "verified" && r.confident !== true) return false
      if (!q) return true
      return (
        r.name.toLowerCase().includes(q) ||
        (r.supplierName?.toLowerCase().includes(q) ?? false)
      )
    })
  }, [rows, filter, search])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <ProgressCard
          label="Ingredients verified"
          done={progress.verifiedIngredients}
          total={progress.totalIngredients}
        />
        <ProgressCard
          label="Dishes fully verified"
          done={progress.verifiedDishes}
          total={progress.totalDishes}
          hint="Every ingredient in the dish has a verified assessment"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or supplier…"
            className="w-64 pl-8"
          />
        </div>
        <div className="flex rounded-lg border border-border p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "rounded-md px-3 py-1 text-sm transition-colors",
                filter === f.value
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
              {f.value === "needs-review" && needsReviewCount > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 text-xs font-medium text-amber-800">
                  {needsReviewCount}
                </span>
              )}
            </button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground">
          {visible.length} ingredient{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((row) => (
          <VerificationRow key={row.id} row={row} />
        ))}
        {visible.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {filter === "needs-review"
                ? "Nothing left to review — every ingredient is verified."
                : "No ingredients match."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function ProgressCard({
  label,
  done,
  total,
  hint,
}: {
  label: string
  done: number
  total: number
  hint?: string
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <Card>
      <CardContent className="space-y-2 pt-6">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">{label}</span>
          <span className="text-sm text-muted-foreground">
            {done} of {total} ({pct}%)
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  )
}

function VerificationRow({ row }: { row: AllergenVerificationRow }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  // null = untouched; seed from the current declaration, falling back to
  // the inbox agent's best guess for unverified ingredients
  const [draft, setDraft] = useState<Allergen[] | null>(null)

  const seed =
    row.currentAllergens.length > 0 ? row.currentAllergens : row.guessAllergens
  const selected = draft ?? seed
  const verified = row.confident === true

  function save() {
    setError(null)
    startTransition(async () => {
      try {
        await verifyIngredientAllergens(row.id, selected)
        setDraft(null)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save")
      }
    })
  }

  return (
    <Card className={cn(verified && "bg-muted/40")}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.name}</span>
              {verified ? (
                <Badge
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {row.source === "human" ? "Label verified" : "Verified"}
                </Badge>
              ) : row.confident === false ? (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-800"
                >
                  <Bot className="mr-1 h-3 w-3" />
                  Unconfirmed guess
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-200 bg-amber-50 text-amber-800"
                >
                  <AlertTriangle className="mr-1 h-3 w-3" />
                  Not assessed
                </Badge>
              )}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {row.supplierName ?? "No supplier"}
              {row.assessedAt &&
                ` · assessed ${new Date(row.assessedAt).toLocaleDateString()}`}
            </div>
          </div>
          <Button
            size="sm"
            onClick={save}
            disabled={pending}
            variant={verified ? "outline" : "default"}
          >
            {pending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            {verified ? "Re-verify" : "Verified from label"}
          </Button>
        </div>

        {row.rationale && !verified && (
          <p className="rounded-md bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
            {row.rationale}
          </p>
        )}

        <AllergenPicker
          value={selected}
          onChange={(v) => setDraft(v)}
        />

        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  )
}
