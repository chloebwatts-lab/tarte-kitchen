"use client"

import {
  useState,
  useTransition,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react"
import Link from "next/link"
import { ArrowRight, CheckCircle2, ShieldCheck, Camera } from "lucide-react"
import { cn } from "@/lib/utils"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import { stripContextPrefix } from "@/lib/display"
import type { ChecklistRunDetail } from "@/lib/actions/checklists"
import { tickChecklistItem, forceCompleteRun } from "@/lib/actions/checklists"
import type { Venue } from "@/generated/prisma/client"
import { ChecklistPhotoUpload } from "@/components/checklist-photo-upload"
import { KitchenChecklistRow } from "@/components/kitchen/KitchenChecklistRow"
import { KitchenSignOffRow } from "@/components/kitchen/KitchenSignOffRow"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

const MIN_CLEANING_PHOTOS = 3
const STAFF_NAME_KEY = "tk-staff-name"
const FIELD_SAVE_DEBOUNCE_MS = 500

type Filter = "all" | "todo" | "done"

export function KitchenRunView({
  initial,
}: {
  initial: ChecklistRunDetail
}) {
  const [items, setItems] = useState(initial.items)
  const [by, setBy] = useState<string>("")
  const [nudgeName, setNudgeName] = useState(false)
  // itemId -> what failed, so "tap to retry" can replay the right thing:
  // a failed tick is re-toggled, a failed temp/note save is re-sent as-is.
  const [saveErrors, setSaveErrors] = useState<
    Record<string, "tick" | "field" | undefined>
  >({})
  const [filter, setFilter] = useState<Filter>("all")
  const [isPending, startTransition] = useTransition()
  const [isSubmitting, startSubmitTransition] = useTransition()
  const [submitted, setSubmitted] = useState(initial.status === "COMPLETED")

  const [photoCount, setPhotoCount] = useState(initial.photos.length)
  const handlePhotosChange = useCallback((n: number) => setPhotoCount(n), [])

  // Latest values for the debounced field saves below; the timers fire after
  // the closures that scheduled them went stale.
  const itemsRef = useRef(items)
  const byRef = useRef(by)
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => {
    byRef.current = by
  }, [by])
  const fieldTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Prefill "your name" from the last run on this iPad. Read after mount
  // (same pattern as house-notes.tsx) so the server render matches the
  // first client render and hydration stays clean.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STAFF_NAME_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot sync from localStorage; a lazy initializer would mismatch the SSR markup
      if (saved) setBy(saved)
    } catch {
      // localStorage unavailable (private mode), prefill is best-effort
    }
  }, [])

  function changeBy(v: string) {
    setBy(v)
    if (v.trim()) setNudgeName(false)
    try {
      window.localStorage.setItem(STAFF_NAME_KEY, v)
    } catch {
      // best-effort only
    }
  }

  const completed = items.filter((i) => i.checkedAt).length
  const total = items.length
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100)
  const allItemsDone = completed === total && total > 0
  const isCleaning = !initial.isFoodSafety
  const photosNeeded = isCleaning ? MIN_CLEANING_PHOTOS : 0
  const photosSatisfied = photoCount >= photosNeeded
  const canComplete = allItemsDone && photosSatisfied

  const venueLabel =
    VENUE_SHORT_LABEL[initial.venue as Venue] ?? initial.venue
  const category = initial.isFoodSafety ? "Food safety" : "Cleaning"
  const categoryParam = initial.isFoodSafety ? "compliance" : "cleaning"
  const listHref = initial.area
    ? `/kitchen?venue=${initial.venue}&category=${categoryParam}&department=${encodeURIComponent(initial.area)}`
    : `/kitchen?venue=${initial.venue}&category=${categoryParam}`

  const breadcrumbs = [
    { label: "Venues", href: "/kitchen" },
    { label: venueLabel, href: `/kitchen?venue=${initial.venue}` },
    {
      label: category,
      href: `/kitchen?venue=${initial.venue}&category=${categoryParam}`,
    },
    ...(initial.area
      ? [
          {
            label: initial.area,
            href: `/kitchen?venue=${initial.venue}&category=${categoryParam}&department=${encodeURIComponent(initial.area)}`,
          },
        ]
      : []),
    { label: stripContextPrefix(initial.templateName, initial.area) },
  ]

  const visibleItems = useMemo(() => {
    if (filter === "todo") return items.filter((i) => !i.checkedAt)
    if (filter === "done") return items.filter((i) => i.checkedAt)
    return items
  }, [items, filter])

  function toggle(itemId: string) {
    const current = items.find((i) => i.id === itemId)
    if (!current) return
    const checked = !current.checkedAt
    const prevCheckedAt = current.checkedAt
    const prevCheckedBy = current.checkedBy
    if (checked && !by.trim()) setNudgeName(true)
    setSaveErrors((prev) => ({ ...prev, [itemId]: undefined }))
    setItems((prev) =>
      prev.map((i) =>
        i.id === itemId
          ? {
              ...i,
              checkedAt: checked ? new Date().toISOString() : null,
              checkedBy: checked ? by || null : null,
            }
          : i
      )
    )
    startTransition(async () => {
      try {
        await tickChecklistItem({
          runId: initial.id,
          runItemId: itemId,
          checked,
          by: by || undefined,
        })
      } catch {
        // Nothing reached the server; put the row back the way it was so
        // the screen never claims a tick that was not saved.
        setItems((prev) =>
          prev.map((i) =>
            i.id === itemId
              ? { ...i, checkedAt: prevCheckedAt, checkedBy: prevCheckedBy }
              : i
          )
        )
        setSaveErrors((prev) => ({ ...prev, [itemId]: "tick" }))
      }
    })
  }

  function updateField(
    itemId: string,
    patch: { tempCelsius?: number | null; note?: string | null }
  ) {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i))
    )
    // Debounced: one save per pause in typing, not one per keystroke.
    const existing = fieldTimers.current.get(itemId)
    if (existing) clearTimeout(existing)
    fieldTimers.current.set(
      itemId,
      setTimeout(() => {
        fieldTimers.current.delete(itemId)
        const current = itemsRef.current.find((i) => i.id === itemId)
        if (!current) return
        startTransition(async () => {
          try {
            await tickChecklistItem({
              runId: initial.id,
              runItemId: itemId,
              checked: !!current.checkedAt,
              tempCelsius: current.tempCelsius,
              note: current.note,
              by: byRef.current || undefined,
            })
            setSaveErrors((prev) => ({ ...prev, [itemId]: undefined }))
          } catch {
            setSaveErrors((prev) => ({ ...prev, [itemId]: "field" }))
          }
        })
      }, FIELD_SAVE_DEBOUNCE_MS)
    )
  }

  function retryFieldSave(itemId: string) {
    const current = items.find((i) => i.id === itemId)
    if (!current) return
    setSaveErrors((prev) => ({ ...prev, [itemId]: undefined }))
    startTransition(async () => {
      try {
        await tickChecklistItem({
          runId: initial.id,
          runItemId: itemId,
          checked: !!current.checkedAt,
          tempCelsius: current.tempCelsius,
          note: current.note,
          by: by || undefined,
        })
      } catch {
        setSaveErrors((prev) => ({ ...prev, [itemId]: "field" }))
      }
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
      {/* Breadcrumb */}
      <KitchenBreadcrumb crumbs={breadcrumbs} />

      {/* Title + progress */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        {/* min-w keeps the title column readable, below it, the progress
            meter wraps to its own row instead of crushing the heading */}
        <div className="min-w-[240px] max-w-full flex-1">
          <h1
            className="tk-display text-[26px] leading-[1.05] text-[var(--tk-charcoal)] md:text-[34px] md:leading-none"
            style={{ fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            {stripContextPrefix(initial.templateName, initial.area)}
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
        <div className="shrink-0 text-left sm:text-right">
          <div className="flex items-baseline justify-start gap-1.5 sm:justify-end">
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
          <div className="mt-2 h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-[var(--tk-line)]">
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

      {/* Name */}
      <div
        className={cn(
          "rounded-[14px] border bg-white p-3 transition-colors",
          nudgeName ? "border-[var(--tk-warn)]" : "border-[var(--tk-line)]"
        )}
      >
        <label className="flex items-center gap-3 text-[14px]">
          <span
            className={cn(
              "font-semibold",
              nudgeName ? "text-[var(--tk-warn)]" : "text-[var(--tk-ink-soft)]"
            )}
          >
            Your name
          </span>
          <input
            value={by}
            onChange={(e) => changeBy(e.target.value)}
            placeholder="First name"
            className={cn(
              "flex-1 rounded-[10px] border bg-white px-3 py-2 text-[17px] font-semibold focus:border-[var(--tk-charcoal)] focus:outline-none",
              nudgeName ? "border-[var(--tk-warn)]" : "border-[var(--tk-line)]"
            )}
          />
        </label>
        <p
          className={cn(
            "mt-1 text-[11px]",
            nudgeName
              ? "font-semibold text-[var(--tk-warn)]"
              : "text-[var(--tk-ink-mute)]"
          )}
        >
          {nudgeName
            ? "Add your name so ticks are stamped for the audit trail."
            : "Stamped on every tick for audit trail."}
        </p>
      </div>

      {/* Items */}
      <div className="space-y-2.5">
        {visibleItems.map((item) => (
          <div key={item.id}>
            <KitchenChecklistRow
              label={stripContextPrefix(item.label)}
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
            {saveErrors[item.id] && (
              <button
                type="button"
                onClick={() =>
                  saveErrors[item.id] === "tick"
                    ? toggle(item.id)
                    : retryFieldSave(item.id)
                }
                className="mt-1.5 w-full rounded-[10px] px-3 py-2 text-left text-[13px] font-semibold"
                style={{
                  background: "var(--tk-warn-soft)",
                  color: "var(--tk-warn)",
                }}
              >
                Couldn&apos;t save, tap to retry.
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Final sign-off, every cleaning checklist needs MIN_CLEANING_PHOTOS
          photos of the cleaned site before it can be marked complete. */}
      {isCleaning && filter !== "done" && (
        <KitchenSignOffRow satisfied={photosSatisfied}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-[14px] font-semibold text-[var(--tk-charcoal)]">
              <Camera className="h-4 w-4" />
              Site photos
              <span
                className="rounded-full px-2 py-0.5 text-[12px]"
                style={{
                  background: photosSatisfied
                    ? "var(--tk-done-soft)"
                    : "var(--tk-gold-soft)",
                  color: photosSatisfied ? "var(--tk-done)" : "#8a6d1f",
                }}
              >
                {photoCount} / {MIN_CLEANING_PHOTOS}
              </span>
            </div>
            <span className="text-[12px] text-[var(--tk-ink-soft)]">
              {photosSatisfied
                ? "Minimum reached. More is fine."
                : `${MIN_CLEANING_PHOTOS - photoCount} more required to submit.`}
            </span>
          </div>
          <ChecklistPhotoUpload
            runId={initial.id}
            initialPhotos={initial.photos}
            uploadedBy={by || null}
            onPhotosChange={handlePhotosChange}
            hideHint
          />
          <p className="mt-2 text-[12px] text-[var(--tk-ink-soft)]">
            Take {MIN_CLEANING_PHOTOS} photos of the cleaned area as evidence
            before closing this section. (Council may ask to see them.)
          </p>
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
              ? `Submitted: ${completed} of ${total} items completed.`
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
            {isCleaning && !photosSatisfied && (
              <span>
                {" "}
                · {MIN_CLEANING_PHOTOS - photoCount} photo
                {MIN_CLEANING_PHOTOS - photoCount === 1 ? "" : "s"} needed
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!allItemsDone && completed > 0 && !submitted && (
              <button
                onClick={handleForceSubmit}
                disabled={isSubmitting || (isCleaning && !photosSatisfied)}
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
