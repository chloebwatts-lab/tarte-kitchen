"use client"

import { useState, useTransition, useMemo } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL, VENUE_LABEL } from "@/lib/venues"
import type { ChecklistRunDetail } from "@/lib/actions/checklists"
import { tickChecklistItem, forceCompleteRun } from "@/lib/actions/checklists"
import type { Venue } from "@/generated/prisma"
import { ChecklistPhotoUpload } from "@/components/checklist-photo-upload"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { KitchenChecklistRow } from "@/components/kitchen/KitchenChecklistRow"
import { KitchenSignOffRow } from "@/components/kitchen/KitchenSignOffRow"

type Filter = "all" | "todo" | "done"

export function KitchenRunView({
  initial,
}: {
  initial: ChecklistRunDetail
}) {
  const [items, setItems] = useState(initial.items)
  const [by, setBy] = useState<string>("")
  const [filter, setFilter] = useState<Filter>("all")
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [submitted, setSubmitted] = useState(initial.status === "COMPLETED")

  const completed = items.filter((i) => i.checkedAt).length
  const total = items.length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const allItemsDone = completed === total && total > 0
  const isCleaning = !initial.isFoodSafety
  // Photos list is owned by ChecklistPhotoUpload internally; seed the
  // visual "satisfied" indicator from the server snapshot.
  const signOffSatisfied = initial.photos.length > 0
  const canComplete = allItemsDone

  const venueLabel =
    VENUE_SHORT_LABEL[initial.venue as Venue] ?? initial.venue
  const venueFull = VENUE_LABEL[initial.venue as Venue] ?? initial.venue
  const category = initial.isFoodSafety ? "Food safety" : "Cleaning"
  const categoryParam = initial.isFoodSafety ? "compliance" : "cleaning"
  const listHref = initial.area
    ? `/kitchen?venue=${initial.venue}&category=${categoryParam}&department=${encodeURIComponent(initial.area)}`
    : `/kitchen?venue=${initial.venue}&category=${categoryParam}`

  const visibleItems = useMemo(() => {
    if (filter === "todo") return items.filter((i) => !i.checkedAt)
    if (filter === "done") return items.filter((i) => i.checkedAt)
    return items
  }, [items, filter])

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

  return (
    <div className={cn("space-y-5 pb-28", isPending && "opacity-90")}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--tk-line)] pb-4">
        <Link
          href={listHref}
          className="inline-flex items-center gap-2 px-2 py-2 text-[14px] font-semibold text-[var(--tk-ink-soft)]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>
        <KitchenLogo size={0.85} />
        <Link
          href={listHref}
          className="rounded-[10px] border border-[var(--tk-line)] px-3.5 py-2 text-[13px] font-semibold text-[var(--tk-ink-soft)]"
        >
          Save &amp; close
        </Link>
      </div>

      {/* Title + progress */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0 flex-1">
          <div className="tk-caps mb-1.5" style={{ color: "var(--tk-ink-mute)" }}>
            {venueFull.replace(/\s*\(.*\)$/, "")} · {category}
            {initial.area && ` · ${initial.area}`}
          </div>
          <h1
            className="tk-display leading-none text-[var(--tk-charcoal)]"
            style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            {initial.templateName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-[var(--tk-ink-soft)]">
            <span className="font-semibold">{venueLabel}</span>
            <span>· {initial.shift.toLowerCase()} shift</span>
            {initial.isFoodSafety && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{
                  background: "var(--tk-done-soft)",
                  color: "var(--tk-done)",
                }}
              >
                <ShieldCheck className="h-3 w-3" /> HACCP
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-1.5">
            <div
              className="tk-display tabular-nums leading-none"
              style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--tk-charcoal)" }}
            >
              {completed}
            </div>
            <div className="text-[15px] text-[var(--tk-ink-soft)]">
              / {total} done
            </div>
          </div>
          <div className="mt-2 h-1.5 w-[240px] overflow-hidden rounded-full bg-[var(--tk-line)]">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: allItemsDone ? "var(--tk-done)" : "var(--tk-charcoal)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5">
        {([
          { k: "all" as const, label: "All", n: total },
          { k: "todo" as const, label: "To do", n: total - completed },
          { k: "done" as const, label: "Done", n: completed },
        ]).map((f) => {
          const active = filter === f.k
          return (
            <button
              key={f.k}
              onClick={() => setFilter(f.k)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition",
                active
                  ? "bg-[var(--tk-charcoal)] text-white"
                  : "border border-[var(--tk-line)] text-[var(--tk-ink-soft)]"
              )}
            >
              {f.label}
              <span className={active ? "opacity-70" : "opacity-60"}>{f.n}</span>
            </button>
          )
        })}
      </div>

      {/* Initials */}
      <div className="rounded-[14px] border border-[var(--tk-line)] bg-white p-3">
        <label className="flex items-center gap-3 text-[14px]">
          <span className="font-semibold text-[var(--tk-ink-soft)]">
            Your initials
          </span>
          <input
            value={by}
            onChange={(e) => setBy(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="e.g. CR"
            className="flex-1 rounded-[10px] border border-[var(--tk-line)] bg-white px-3 py-2 text-[17px] font-semibold uppercase tabular-nums focus:border-[var(--tk-charcoal)] focus:outline-none"
          />
        </label>
        <p className="mt-1 text-[11px] text-[var(--tk-ink-mute)]">
          Stamped on every tick for audit trail.
        </p>
      </div>

      {/* Items */}
      <div className="space-y-2.5">
        {visibleItems.map((item) => (
          <KitchenChecklistRow
            key={item.id}
            label={item.label}
            instructions={item.instructions}
            requireTemp={item.requireTemp}
            requireNote={item.requireNote}
            tempCelsius={item.tempCelsius}
            note={item.note}
            checkedAt={item.checkedAt}
            checkedBy={item.checkedBy}
            onToggle={() => toggle(item.id)}
            onTempChange={(v) => updateField(item.id, { tempCelsius: v })}
            onNoteChange={(v) => updateField(item.id, { note: v })}
          />
        ))}
      </div>

      {/* Final sign-off — mandatory on every cleaning checklist */}
      {isCleaning && filter !== "done" && (
        <KitchenSignOffRow satisfied={signOffSatisfied}>
          <ChecklistPhotoUpload
            runId={initial.id}
            initialPhotos={initial.photos}
            uploadedBy={by || null}
          />
          {!signOffSatisfied && (
            <p className="mt-2 text-[12px] text-[var(--tk-ink-soft)]">
              Take a photo of the finished station before closing the section.
            </p>
          )}
        </KitchenSignOffRow>
      )}

      {/* Non-cleaning completion photos (optional, post-done) */}
      {!isCleaning && (allItemsDone || submitted) && (
        <div className="rounded-[16px] border border-[var(--tk-line)] bg-white p-4">
          <div className="mb-2 text-[15px] font-semibold text-[var(--tk-charcoal)]">
            Completion photos
          </div>
          <ChecklistPhotoUpload
            runId={initial.id}
            initialPhotos={initial.photos}
            uploadedBy={by || null}
          />
        </div>
      )}

      {/* Completion banner */}
      {(canComplete || submitted) && (
        <div
          className="flex items-center gap-3 rounded-[18px] p-5"
          style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
        >
          <CheckCircle2 className="h-8 w-8 shrink-0" />
          <div className="text-[16px] font-semibold">
            {submitted
              ? `Submitted — ${completed} of ${total} items completed.`
              : "All checks complete. Ready to sign off."}
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div
        className="fixed inset-x-0 bottom-0 border-t border-[var(--tk-line)]"
        style={{
          background: "rgba(246,245,242,0.92)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="mx-auto flex max-w-[1194px] items-center justify-between gap-4 px-6 py-3 md:px-10">
          <div className="text-[14px] text-[var(--tk-ink-soft)]">
            <span className="font-semibold text-[var(--tk-charcoal)]">
              {total - completed} left
            </span>
            {isCleaning && !signOffSatisfied && (
              <span> · don&apos;t forget the sign-off photo</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!allItemsDone && completed > 0 && !submitted && (
              <button
                onClick={handleForceSubmit}
                disabled={isSubmitting}
                className="rounded-[12px] border border-[var(--tk-warn)] px-4 py-3 text-[13px] font-semibold text-[var(--tk-warn)] disabled:opacity-50"
              >
                {isSubmitting ? "Submitting…" : "Submit incomplete"}
              </button>
            )}
            <button
              onClick={handleForceSubmit}
              disabled={!canComplete || isSubmitting || submitted}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-[14px] px-5 py-3.5 text-[15px] font-semibold transition",
                canComplete && !submitted
                  ? "bg-[var(--tk-charcoal)] text-white"
                  : "bg-[var(--tk-charcoal-soft)] text-[var(--tk-ink-mute)]"
              )}
            >
              {submitted ? "Submitted" : "Complete section"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* After submit: return link */}
      {submitted && (
        <Link
          href={listHref}
          className="block w-full rounded-[14px] bg-[var(--tk-charcoal)] px-4 py-4 text-center text-[15px] font-semibold text-white"
        >
          Back to checklists
        </Link>
      )}

    </div>
  )
}
