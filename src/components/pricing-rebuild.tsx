"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowUpRight, ArrowDownRight, Check, X, Leaf, Package, RefreshCw, HelpCircle, Loader2 } from "lucide-react"
import {
  answerPackQuestion,
  rejectProduct,
  acceptProductAlertAction,
  dismissProductAlertAction,
  recomputeProductAlertsAction,
  type PackQuestion,
  type ProductAlertRow,
} from "@/lib/actions/pricing"
import { formatPerDisplayUnit, displayUnit, perDisplayUnit } from "@/lib/pricing/display"

function categoryLabel(raw: string): string {
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase().replace(/_/g, " ")
}

export function PricingRebuild({ questions, alerts }: { questions: PackQuestion[]; alerts: ProductAlertRow[] }) {
  const router = useRouter()
  const [tab, setTab] = useState<"STABLE" | "PRODUCE">("STABLE")
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const stable = alerts.filter((a) => a.stream === "STABLE")
  const produce = alerts.filter((a) => a.stream === "PRODUCE")
  const visible = tab === "STABLE" ? stable : produce

  const run = (key: string, fn: () => Promise<{ ok: boolean; reason?: string } | unknown>) => {
    setBusy(key)
    setError(null)
    startTransition(async () => {
      try {
        const r = (await fn()) as { ok?: boolean; reason?: string } | undefined
        if (r && r.ok === false) setError(r.reason ?? "Something went wrong")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong")
      }
      setBusy(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      {error && <div className="rounded-md border border-red-text/30 bg-red-light px-3 py-2 text-sm text-red-text">{error}</div>}

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Pack questions ({questions.length})</h2>
          <span className="text-xs text-muted-foreground">answer once per product; the whole history is repriced from it</span>
        </div>
        <Card>
          <CardContent className="p-0">
            {questions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Nothing to answer. Every product seen has a pack on file.</div>
            ) : (
              <ul className="divide-y">
                {questions.map((q) => (
                  <PackQuestionRow key={q.productId} q={q} busy={busy === q.productId} onAnswer={(n) => run(q.productId, () => answerPackQuestion(q.productId, n))} onReject={() => run(q.productId, () => rejectProduct(q.productId))} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <button type="button" onClick={() => setTab("STABLE")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === "STABLE" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              <Package className="h-3.5 w-3.5" /> Pantry &amp; stable ({stable.length})
            </button>
            <button type="button" onClick={() => setTab("PRODUCE")} className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${tab === "PRODUCE" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
              <Leaf className="h-3.5 w-3.5" /> Fruit &amp; veg ({produce.length})
            </button>
          </div>
          <Button variant="ghost" size="sm" disabled={busy === "recompute"} onClick={() => run("recompute", recomputeProductAlertsAction)}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${busy === "recompute" ? "animate-spin" : ""}`} /> Recompute
          </Button>
        </div>
        <Card>
          <CardContent className="p-0">
            {visible.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No {tab === "PRODUCE" ? "produce" : "stable"} price moves open.</div>
            ) : (
              <ul className="divide-y">
                {visible.map((a) => (
                  <AlertRow key={a.id} a={a} busy={busy === a.id} onAccept={() => run(a.id, () => acceptProductAlertAction(a.id))} onDismiss={() => run(a.id, () => dismissProductAlertAction(a.id))} />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function PackQuestionRow({ q, busy, onAnswer, onReject }: { q: PackQuestion; busy: boolean; onAnswer: (n: number) => void; onReject: () => void }) {
  const [value, setValue] = useState(q.suggested !== null ? String(q.suggested) : "")
  const n = Number(value)
  const valid = Number.isFinite(n) && n > 0
  const unit = q.billedUnit?.toLowerCase() || "unit"
  const implied = valid && q.latestBilledUnitPrice ? q.latestBilledUnitPrice / n : null
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{q.description}</span>
          {q.productCode && <span className="text-xs text-muted-foreground">#{q.productCode}</span>}
          <span className="text-xs text-muted-foreground">{q.supplierName}</span>
          <Badge variant="outline" className="text-xs">{q.ingredientName}</Badge>
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          One <b>{unit}</b> of this holds how many <b>{q.baseUnitLabel}</b> of {q.ingredientName}?
          {q.explanation && <span className="ml-1 text-muted-foreground/80">({q.explanation})</span>}
          {q.latestBilledUnitPrice !== null && (
            <span className="ml-1">Last billed ${q.latestBilledUnitPrice.toFixed(2)}/{unit}{q.latestObservedAt ? ` on ${q.latestObservedAt}` : ""}, {q.linesSeen} line{q.linesSeen === 1 ? "" : "s"} seen.</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={0.001}
          step="any"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-28 rounded border border-border bg-background px-2 py-1 text-right text-sm tabular-nums"
          aria-label={`${q.baseUnitLabel} per ${unit}`}
        />
        <span className="text-xs text-muted-foreground">{q.baseUnitLabel}/{unit}</span>
        {implied !== null && (
          <span className="text-xs tabular-nums text-muted-foreground">= ${(implied * (q.baseUnitLabel === "ea" ? 1 : 1000)).toFixed(2)}/{q.baseUnitLabel === "g" ? "kg" : q.baseUnitLabel === "ml" ? "L" : "ea"}</span>
        )}
        <Button size="sm" disabled={!valid || busy} onClick={() => onAnswer(n)}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Confirm
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onReject} title="Wrong ingredient; ignore this product">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  )
}

function AlertRow({ a, busy, onAccept, onDismiss }: { a: ProductAlertRow; busy: boolean; onAccept: () => void; onDismiss: () => void }) {
  const up = a.changePct > 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  const tone = up ? "text-red-text" : "text-green-text"
  const du = displayUnit(a.baseUnitType)
  return (
    <li className="flex flex-wrap items-center gap-3 p-3 hover:bg-muted/30">
      <Icon className={`h-5 w-5 shrink-0 ${tone}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{a.ingredientName}</span>
          <Badge variant="outline" className="text-xs">{categoryLabel(a.category)}</Badge>
          <span className="text-xs text-muted-foreground">{a.description} via {a.supplierName}{a.billedUnit ? `, per ${a.billedUnit.toLowerCase()}` : ""}</span>
        </div>
        <div className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {formatPerDisplayUnit(a.priorPerBase, a.baseUnitType)}
          {a.stream === "PRODUCE" && <span className="text-muted-foreground/70"> (4-wk median)</span>}
          {" → "}
          <span className={`font-medium ${tone}`}>{formatPerDisplayUnit(a.currentPerBase, a.baseUnitType)}</span>
          <span className={`ml-2 ${tone}`}>{up ? "+" : ""}{a.changePct.toFixed(1)}%</span>
          {a.weeklyImpactDollars !== null && (
            <span className="ml-2">{a.weeklyImpactDollars >= 0 ? "+" : "−"}${Math.abs(a.weeklyImpactDollars).toFixed(0)}/wk</span>
          )}
          {a.ingredientPerBase !== null && a.stream === "PRODUCE" && (
            <span className="ml-2">recipes cost at {formatPerDisplayUnit(a.ingredientPerBase, a.baseUnitType)}</span>
          )}
        </div>
        {a.history.length > 1 && (
          <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground/80" title="Last deliveries, oldest first">
            {a.history.map((h, i) => (
              <span key={h.date}>{i > 0 && " · "}{perDisplayUnit(h.perBase, a.baseUnitType).toFixed(2)}</span>
            ))}
            <span className="ml-1">$/{du}</span>
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <Button size="sm" disabled={busy} onClick={onAccept} title="Set the ingredient's cost to this price and recost every recipe">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />} Accept
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onDismiss} title="Not now; asks again only if the price moves further">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  )
}
