"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Save, CheckCircle2, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type {
  StocktakeDetail,
  StocktakeIngredient,
} from "@/lib/actions/stocktake"
import { saveStocktakeCounts } from "@/lib/actions/stocktake"

interface Props {
  detail: StocktakeDetail
  ingredients: StocktakeIngredient[]
}

interface LocalCount {
  qty: string
  unit: string
  note: string
  dirty: boolean
}

export function StocktakeCount({ detail, ingredients }: Props) {
  const submitted = detail.status === "SUBMITTED"

  // If submitted, show the variance table. Otherwise show the count form.
  if (submitted) return <SubmittedView detail={detail} />

  return <DraftCountView detail={detail} ingredients={ingredients} />
}

function DraftCountView({ detail, ingredients }: Props) {
  const [search, setSearch] = useState("")
  const [category, setCategory] = useState<string>("ALL")
  const [showOnlyUncounted, setShowOnlyUncounted] = useState(false)
  const [counts, setCounts] = useState<Record<string, LocalCount>>(() => {
    const init: Record<string, LocalCount> = {}
    for (const ing of ingredients) {
      if (ing.currentCountedQty !== null) {
        init[ing.id] = {
          qty: String(ing.currentCountedQty),
          unit: ing.currentCountedUnit ?? ing.baseUnitLabel,
          note: ing.currentNote ?? "",
          dirty: false,
        }
      }
    }
    return init
  })
  const [isPending, startTransition] = useTransition()
  const [lastSavedTotal, setLastSavedTotal] = useState<number>(detail.totalValue)

  const categories = useMemo(() => {
    const s = new Set<string>()
    ingredients.forEach((i) => s.add(i.category))
    return Array.from(s).sort()
  }, [ingredients])

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase()
    return ingredients.filter((i) => {
      if (category !== "ALL" && i.category !== category) return false
      if (s && !i.name.toLowerCase().includes(s)) return false
      if (showOnlyUncounted) {
        const c = counts[i.id]
        if (c && c.qty) return false
      }
      return true
    })
  }, [ingredients, search, category, showOnlyUncounted, counts])

  const countedCount = Object.values(counts).filter((c) => c.qty).length
  const runningValue = useMemo(() => {
    return ingredients.reduce((sum, ing) => {
      const c = counts[ing.id]
      if (!c || !c.qty) return sum
      const qty = parseFloat(c.qty) || 0
      const normalised = normaliseQty(qty, c.unit, ing.baseUnitType)
      const unitCost =
        ing.baseUnitsPerPurchase > 0
          ? ing.purchasePrice / ing.baseUnitsPerPurchase
          : 0
      return sum + normalised * unitCost
    }, 0)
  }, [ingredients, counts])

  function updateCount(id: string, patch: Partial<LocalCount>) {
    setCounts((prev) => ({
      ...prev,
      [id]: {
        qty: "",
        unit: ingredients.find((i) => i.id === id)?.baseUnitLabel ?? "g",
        note: "",
        dirty: true,
        ...(prev[id] ?? {}),
        ...patch,
        dirty: true,
      },
    }))
  }

  async function saveAll(submit: boolean) {
    const payload = Object.entries(counts)
      .filter(([, c]) => c.qty)
      .map(([id, c]) => ({
        ingredientId: id,
        qty: parseFloat(c.qty) || 0,
        unit: c.unit,
        note: c.note || undefined,
      }))
    startTransition(async () => {
      const res = await saveStocktakeCounts({
        stocktakeId: detail.id,
        counts: payload,
        submit,
      })
      setLastSavedTotal(res.total)
      if (submit) window.location.reload()
      // clear dirty flag
      setCounts((prev) => {
        const next = { ...prev }
        for (const k of Object.keys(next)) next[k] = { ...next[k], dirty: false }
        return next
      })
    })
  }

  return (
    <div className={cn("space-y-6", isPending && "opacity-70")}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            href="/stocktake"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to stocktakes
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Stocktake — {formatDate(detail.date)}
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{VENUE_SHORT_LABEL[detail.venue] ?? detail.venue}</Badge>
            <Badge variant="amber">Draft</Badge>
            <span>
              {countedCount} of {ingredients.length} ingredients counted
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => saveAll(false)}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Save draft
          </button>
          <button
            onClick={() => saveAll(true)}
            disabled={isPending || countedCount === 0}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            Submit
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Counted value</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${runningValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              Live from counts above
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Last saved</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${lastSavedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              Submit to lock variance
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Coverage</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {ingredients.length === 0
                ? 0
                : Math.round((countedCount / ingredients.length) * 100)}
              %
            </p>
            <p className="text-xs text-muted-foreground">
              {countedCount} / {ingredients.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium">Count ingredients</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search"
                  className="w-48 rounded-md border border-border bg-background py-1 pl-7 pr-2 text-xs"
                />
              </div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded-md border border-border bg-background px-2 py-1 text-xs"
              >
                <option value="ALL">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showOnlyUncounted}
                  onChange={(e) => setShowOnlyUncounted(e.target.checked)}
                />
                Uncounted only
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing matches.
            </p>
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pl-6">Ingredient</th>
                    <th className="py-2">Category</th>
                    <th className="py-2">Count</th>
                    <th className="py-2">Unit</th>
                    <th className="py-2">Note</th>
                    <th className="py-2 pr-6 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ing) => (
                    <CountRow
                      key={ing.id}
                      ing={ing}
                      value={counts[ing.id]}
                      onChange={(patch) => updateCount(ing.id, patch)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function CountRow({
  ing,
  value,
  onChange,
}: {
  ing: StocktakeIngredient
  value: LocalCount | undefined
  onChange: (patch: Partial<LocalCount>) => void
}) {
  const qty = value?.qty ?? ""
  const unit = value?.unit ?? ing.baseUnitLabel
  const note = value?.note ?? ""
  const qtyNum = parseFloat(qty) || 0
  const baseQty = qtyNum > 0 ? normaliseQty(qtyNum, unit, ing.baseUnitType) : 0
  const unitCost =
    ing.baseUnitsPerPurchase > 0
      ? ing.purchasePrice / ing.baseUnitsPerPurchase
      : 0
  const lineValue = baseQty * unitCost

  const allowedUnits =
    ing.baseUnitType === "WEIGHT"
      ? ["g", "kg"]
      : ing.baseUnitType === "VOLUME"
        ? ["ml", "l"]
        : ["ea", ing.purchaseUnit].filter((u, i, a) => a.indexOf(u) === i)

  return (
    <tr className="border-b border-border/50 last:border-0">
      <td className="py-2 pl-6 font-medium">{ing.name}</td>
      <td className="py-2 text-xs text-muted-foreground">
        {ing.category.replace(/_/g, " ")}
      </td>
      <td className="py-2">
        <input
          inputMode="decimal"
          value={qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
          placeholder="0"
        />
      </td>
      <td className="py-2">
        <select
          value={unit}
          onChange={(e) => onChange({ unit: e.target.value })}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm"
        >
          {allowedUnits.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2">
        <input
          value={note}
          onChange={(e) => onChange({ note: e.target.value })}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs"
          placeholder="Optional"
        />
      </td>
      <td className="py-2 pr-6 text-right tabular-nums text-xs">
        {qty ? `$${lineValue.toFixed(2)}` : "—"}
      </td>
    </tr>
  )
}

function SubmittedView({ detail }: { detail: StocktakeDetail }) {
  const itemsWithVariance = detail.items.filter(
    (i) => i.varianceBaseQty !== null
  )
  const totalShrinkage = itemsWithVariance.reduce(
    (s, i) => s + Math.min(i.varianceValue ?? 0, 0),
    0
  )
  const totalOver = itemsWithVariance.reduce(
    (s, i) => s + Math.max(i.varianceValue ?? 0, 0),
    0
  )
  const flagged = itemsWithVariance
    .filter((i) => (i.varianceValue ?? 0) !== 0)
    .sort(
      (a, b) => Math.abs(b.varianceValue ?? 0) - Math.abs(a.varianceValue ?? 0)
    )

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/stocktake"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to stocktakes
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Stocktake — {formatDate(detail.date)}
        </h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{VENUE_SHORT_LABEL[detail.venue] ?? detail.venue}</Badge>
          <Badge variant="green">Submitted</Badge>
          <span>{detail.items.length} items counted</span>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total stock value</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              ${detail.totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Shrinkage (under)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-red-600">
              ${Math.abs(totalShrinkage).toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">
              vs theoretical usage
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Over (positive)</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-600">
              ${totalOver.toFixed(0)}
            </p>
            <p className="text-xs text-muted-foreground">
              Counted more than expected
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Items flagged</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {flagged.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            Variance — biggest movers first
          </CardTitle>
        </CardHeader>
        <CardContent>
          {flagged.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No variance data yet — this needs a previous submitted stocktake
              at the same venue to compute expected stock.
            </p>
          ) : (
            <div className="-mx-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pl-6">Ingredient</th>
                    <th className="py-2 text-right">Counted</th>
                    <th className="py-2 text-right">Expected</th>
                    <th className="py-2 text-right">Variance</th>
                    <th className="py-2 pr-6 text-right">$ impact</th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((it) => {
                    const v = it.varianceBaseQty ?? 0
                    const positive = v > 0
                    return (
                      <tr
                        key={it.id}
                        className="border-b border-border/50 last:border-0"
                      >
                        <td className="py-2 pl-6 font-medium">
                          {it.ingredientName}
                          <div className="text-[10px] text-muted-foreground">
                            {it.category.replace(/_/g, " ")}
                          </div>
                        </td>
                        <td className="py-2 text-right tabular-nums">
                          {it.countedQty} {it.countedUnit}
                        </td>
                        <td className="py-2 text-right tabular-nums text-muted-foreground">
                          {Math.round(it.expectedBaseQty ?? 0)} {it.baseUnit}
                        </td>
                        <td
                          className={cn(
                            "py-2 text-right tabular-nums font-medium",
                            positive ? "text-emerald-600" : "text-red-600"
                          )}
                        >
                          <span className="inline-flex items-center gap-0.5">
                            {positive ? (
                              <ArrowUpRight className="h-3 w-3" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" />
                            )}
                            {Math.round(v)} {it.baseUnit}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-6 text-right tabular-nums font-medium",
                            positive ? "text-emerald-600" : "text-red-600"
                          )}
                        >
                          {positive ? "+" : ""}$
                          {Math.abs(it.varianceValue ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function normaliseQty(
  qty: number,
  unit: string,
  baseType: "WEIGHT" | "VOLUME" | "COUNT"
) {
  const u = unit.toLowerCase()
  if (baseType === "WEIGHT") {
    if (u === "kg") return qty * 1000
    return qty
  }
  if (baseType === "VOLUME") {
    if (u === "l") return qty * 1000
    return qty
  }
  return qty
}
