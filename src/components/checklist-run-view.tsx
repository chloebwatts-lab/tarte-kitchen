"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import {
  CheckCircle2,
  Circle,
  ArrowLeft,
  ShieldCheck,
  Thermometer,
  MessageSquare,
  Camera,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { ChecklistRunDetail } from "@/lib/actions/checklists"
import { tickChecklistItem, forceCompleteRun } from "@/lib/actions/checklists"
import type { Venue } from "@/generated/prisma"
import { ChecklistPhotoUpload } from "@/components/checklist-photo-upload"

export function ChecklistRunView({
  initial,
}: {
  initial: ChecklistRunDetail
}) {
  const [items, setItems] = useState(initial.items)
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [submitted, setSubmitted] = useState(initial.status === "COMPLETED")
  const [expanded, setExpanded] = useState<string | null>(null)

  const completed = items.filter((i) => i.checkedAt).length
  const pct = items.length === 0 ? 0 : Math.round((completed / items.length) * 100)
  const isDone = completed === items.length && items.length > 0
  const showSubmit = !isDone && !submitted && completed > 0
  const showCompletion = isDone || submitted

  function toggle(itemId: string) {
    const current = items.find((i) => i.id === itemId)
    if (!current) return
    const checked = !current.checkedAt
    // Optimistic update
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? { ...i, checkedAt: checked ? new Date().toISOString() : null }
          : i
      )
    )
    startTransition(async () => {
      await tickChecklistItem({
        runId: initial.id,
        runItemId: itemId,
        checked,
      })
    })
  }

  function updateField(
    itemId: string,
    patch: { tempCelsius?: number | null; note?: string | null }
  ) {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i))
    )
    startTransition(async () => {
      const it = items.find((i) => i.id === itemId)
      await tickChecklistItem({
        runId: initial.id,
        runItemId: itemId,
        checked: !!it?.checkedAt,
        ...patch,
      })
    })
  }

  return (
    <div className={cn("space-y-6", isPending && "opacity-80")}>
      <div>
        <Link
          href="/checklists"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to checklists
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {initial.templateName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Badge variant="outline">
                {VENUE_SHORT_LABEL[initial.venue as Venue] ?? initial.venue}
              </Badge>
              {initial.area && <Badge variant="outline">{initial.area}</Badge>}
              {initial.isFoodSafety && (
                <Badge variant="green" className="gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> HACCP
                </Badge>
              )}
              <span>
                {new Date(initial.runDate).toLocaleDateString("en-AU", {
                  weekday: "long",
                  day: "numeric",
                  month: "short",
                })}{" "}
                · {initial.shift.toLowerCase()} shift
              </span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold tabular-nums">
              {completed} / {items.length}
            </div>
            <div className="text-xs text-muted-foreground">
              {pct}% complete
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className={cn(
              "h-full transition-all",
              isDone ? "bg-emerald-500" : "bg-amber-500"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <Card>
        <CardContent className="space-y-1 p-3">
          {items.map((item) => {
            const checked = !!item.checkedAt
            const isExpanded = expanded === item.id
            return (
              <div
                key={item.id}
                className={cn(
                  "group rounded-md border px-3 py-2.5 transition-colors",
                  checked
                    ? "border-emerald-100 bg-emerald-50/50"
                    : "border-border bg-white hover:bg-muted/30"
                )}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggle(item.id)}
                    className={cn(
                      "mt-0.5 shrink-0 rounded-full transition-transform active:scale-90",
                      checked ? "text-emerald-600" : "text-gray-300 hover:text-gray-500"
                    )}
                    aria-label={checked ? "Uncheck" : "Check"}
                  >
                    {checked ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button
                      onClick={() =>
                        setExpanded(isExpanded ? null : item.id)
                      }
                      className="block w-full text-left"
                    >
                      <div
                        className={cn(
                          "text-sm",
                          checked && "text-muted-foreground line-through"
                        )}
                      >
                        {item.label}
                      </div>
                      {item.instructions && !isExpanded && (
                        <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                          {item.instructions}
                        </div>
                      )}
                    </button>
                    {(isExpanded || item.requireTemp || item.requireNote) && (
                      <div className="mt-2 space-y-2">
                        {item.instructions && isExpanded && (
                          <p className="text-xs text-muted-foreground">
                            {item.instructions}
                          </p>
                        )}
                        {item.requireTemp && (
                          <label className="flex items-center gap-1.5 text-xs">
                            <Thermometer className="h-3.5 w-3.5 text-emerald-600" />
                            <span className="text-muted-foreground">
                              Temp (°C)
                            </span>
                            <input
                              inputMode="decimal"
                              value={item.tempCelsius ?? ""}
                              onChange={(e) =>
                                updateField(item.id, {
                                  tempCelsius:
                                    e.target.value === ""
                                      ? null
                                      : parseFloat(e.target.value),
                                })
                              }
                              className="w-20 rounded-md border border-border bg-background px-2 py-0.5 text-xs tabular-nums"
                            />
                          </label>
                        )}
                        {item.requireNote && (
                          <label className="flex items-start gap-1.5 text-xs">
                            <MessageSquare className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                            <input
                              value={item.note ?? ""}
                              onChange={(e) =>
                                updateField(item.id, { note: e.target.value || null })
                              }
                              className="flex-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs"
                              placeholder="Note…"
                            />
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                  {checked && item.checkedAt && (
                    <div className="shrink-0 text-right text-[10px] text-muted-foreground">
                      {new Date(item.checkedAt).toLocaleTimeString("en-AU", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {showSubmit && (
        <button
          onClick={() => startSubmitTransition(async () => { await forceCompleteRun(initial.id); setSubmitted(true) })}
          disabled={isSubmitting}
          className="w-full rounded-md border border-amber-300 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
        >
          {isSubmitting ? "Submitting…" : `Submit with ${items.length - completed} item${items.length - completed !== 1 ? "s" : ""} incomplete`}
        </button>
      )}

      {showCompletion && (
        <>
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="py-4 text-center text-sm text-emerald-800">
              <CheckCircle2 className="mx-auto mb-1 h-6 w-6" />
              {isDone
                ? "All checked — this run is logged for compliance."
                : `Submitted — ${completed} of ${items.length} items completed.`}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Camera className="h-4 w-4 text-gray-500" />
                Completion photos
              </div>
              <p className="text-xs text-muted-foreground">
                Take photos showing the completed work before leaving.
              </p>
              <ChecklistPhotoUpload
                runId={initial.id}
                initialPhotos={initial.photos}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
