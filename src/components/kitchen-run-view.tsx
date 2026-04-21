"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { CheckCircle2, Circle, Thermometer, ArrowLeft, ShieldCheck, Camera } from "lucide-react"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { ChecklistRunDetail } from "@/lib/actions/checklists"
import { tickChecklistItem, forceCompleteRun } from "@/lib/actions/checklists"
import type { Venue } from "@/generated/prisma"
import { ChecklistPhotoUpload } from "@/components/checklist-photo-upload"

export function KitchenRunView({
  initial,
}: {
  initial: ChecklistRunDetail
}) {
  const [items, setItems] = useState(initial.items)
  const [by, setBy] = useState<string>("")
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [submitted, setSubmitted] = useState(initial.status === "COMPLETED")

  const completed = items.filter((i) => i.checkedAt).length
  const pct = items.length === 0 ? 0 : Math.round((completed / items.length) * 100)
  const isDone = completed === items.length && items.length > 0
  const showSubmit = !isDone && !submitted && completed > 0

  function toggle(itemId: string) {
    const current = items.find((i) => i.id === itemId)
    if (!current) return
    const checked = !current.checkedAt
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
        by: by || undefined,
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
    const current = items.find((i) => i.id === itemId)
    startTransition(async () => {
      await tickChecklistItem({
        runId: initial.id,
        runItemId: itemId,
        checked: !!current?.checkedAt,
        ...patch,
        by: by || undefined,
      })
    })
  }

  function handleForceSubmit() {
    startSubmitTransition(async () => {
      await forceCompleteRun(initial.id)
      setSubmitted(true)
    })
  }

  const showCompletion = isDone || submitted

  return (
    <div className={cn("space-y-5", isPending && "opacity-80")}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/kitchen?venue=${initial.venue}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
          <h1 className="mt-2 text-3xl font-bold leading-tight">
            {initial.templateName}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">
              {VENUE_SHORT_LABEL[initial.venue as Venue] ?? initial.venue}
            </span>
            {initial.area && <span>· {initial.area}</span>}
            <span>· {initial.shift.toLowerCase()} shift</span>
            {initial.isFoodSafety && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                <ShieldCheck className="h-3 w-3" /> HACCP
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-4xl font-bold tabular-nums">
            {completed}/{items.length}
          </div>
          <div className="text-xs text-muted-foreground">{pct}%</div>
        </div>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={cn("h-full transition-all", isDone ? "bg-emerald-500" : "bg-amber-500")}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Initials */}
      <div className="rounded-xl border-2 border-gray-200 bg-white p-3">
        <label className="flex items-center gap-3 text-sm">
          <span className="font-medium text-muted-foreground">Your initials</span>
          <input
            value={by}
            onChange={(e) => setBy(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="e.g. CR"
            className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-lg font-semibold tabular-nums uppercase"
          />
        </label>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Stamped on every tick for audit trail.
        </p>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item) => {
          const checked = !!item.checkedAt
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border-2 px-4 py-3 transition-colors",
                checked
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-gray-200 bg-white"
              )}
            >
              <button
                onClick={() => toggle(item.id)}
                className="flex w-full items-start gap-4 text-left"
              >
                <span
                  className={cn(
                    "mt-0.5 shrink-0 transition-transform active:scale-90",
                    checked ? "text-emerald-600" : "text-gray-300"
                  )}
                >
                  {checked ? (
                    <CheckCircle2 className="h-10 w-10" />
                  ) : (
                    <Circle className="h-10 w-10" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-lg font-medium leading-snug",
                      checked && "text-muted-foreground line-through"
                    )}
                  >
                    {item.label}
                  </div>
                  {item.instructions && (
                    <div className="mt-1 text-sm text-muted-foreground">
                      {item.instructions}
                    </div>
                  )}
                </div>
                {checked && item.checkedAt && (
                  <div className="shrink-0 text-right text-xs text-muted-foreground">
                    {new Date(item.checkedAt).toLocaleTimeString("en-AU", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {item.checkedBy && (
                      <div className="font-semibold">{item.checkedBy}</div>
                    )}
                  </div>
                )}
              </button>

              {(item.requireTemp || item.requireNote) && (
                <div className="mt-3 space-y-2 pl-14">
                  {item.requireTemp && (
                    <label className="flex items-center gap-2">
                      <Thermometer className="h-5 w-5 text-emerald-600" />
                      <span className="text-sm text-muted-foreground">
                        Temp °C
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
                        className="w-24 rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-lg font-semibold tabular-nums"
                      />
                    </label>
                  )}
                  {item.requireNote && (
                    <input
                      value={item.note ?? ""}
                      onChange={(e) =>
                        updateField(item.id, { note: e.target.value || null })
                      }
                      className="w-full rounded-md border-2 border-gray-300 bg-white px-3 py-2 text-base"
                      placeholder="Note…"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Submit incomplete */}
      {showSubmit && (
        <button
          onClick={handleForceSubmit}
          disabled={isSubmitting}
          className="w-full rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-center text-sm font-semibold text-amber-900 disabled:opacity-50"
        >
          {isSubmitting
            ? "Submitting…"
            : `Submit with ${items.length - completed} item${items.length - completed !== 1 ? "s" : ""} incomplete`}
        </button>
      )}

      {/* Completion card + photos */}
      {showCompletion && (
        <div className="space-y-4">
          <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <div className="mt-2 text-lg font-semibold text-emerald-900">
              {isDone ? "Done — logged." : `Submitted — ${completed} of ${items.length} items completed.`}
            </div>
          </div>

          <div className="rounded-2xl border-2 border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-gray-800">
              <Camera className="h-5 w-5 text-gray-500" />
              Completion photos
            </div>
            <p className="text-sm text-muted-foreground">
              Take photos showing the completed work before leaving.
            </p>
            <ChecklistPhotoUpload
              runId={initial.id}
              initialPhotos={initial.photos}
              uploadedBy={by || null}
            />
          </div>

          <Link
            href={`/kitchen?venue=${initial.venue}`}
            className="block w-full rounded-2xl bg-emerald-600 px-4 py-4 text-center text-sm font-semibold text-white"
          >
            Back to checklists
          </Link>
        </div>
      )}
    </div>
  )
}
