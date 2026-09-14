"use client"

import { useMemo, useState, useTransition } from "react"
import { Check, SkipForward, RotateCcw, ArrowRight, Clock, Loader2 } from "lucide-react"
import type { PrepSheet, PrepSheetLine } from "@/lib/actions/prep-sheet"
import {
  clearPrepWalkTick,
  resetPrepWalk,
  setPrepWalkTick,
  type PrepWalkStatuses,
} from "@/lib/actions/prep-walk"
import { useRememberedName } from "@/components/kitchen/use-remembered-name"
import { OFFLINE_MESSAGE } from "@/components/kitchen/safe-action"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
type Status = "DONE" | "SKIPPED"

// Fast tap-through: the screen moves on the instant a button is tapped, and
// the tap is written to the server behind it. Progress therefore lives in
// one place for every device, survives the iPad's browser being cleared,
// and records who made what. A failed write rolls the tap back and says so.

export function PrepWalkthrough({
  sheet,
  venue,
  initialStatuses,
}: {
  sheet: PrepSheet
  venue: Venue
  initialStatuses: PrepWalkStatuses
}) {
  // Stable ordered list: highest-cost preps first so chefs hit the big-impact
  // items at the start of the shift while attention is fresh.
  const lines = useMemo(
    () =>
      [...sheet.lines].sort((a, b) => b.totalCost - a.totalCost),
    [sheet.lines],
  )

  const [statuses, setStatuses] = useState<Record<string, Status>>(initialStatuses)
  const [index, setIndex] = useState(0)
  const [name, setName] = useRememberedName()
  const [error, setError] = useState("")
  const [saving, startSave] = useTransition()

  const done = lines.filter((l) => statuses[l.preparationId] === "DONE").length
  const skipped = lines.filter((l) => statuses[l.preparationId] === "SKIPPED")
    .length
  const remaining = lines.length - done - skipped
  const finished = remaining === 0 && lines.length > 0

  if (lines.length === 0) {
    // Two reasons we'd land here: (a) genuinely nothing forecast (rare,
    // would imply zero same-weekday sales in the last 8 weeks), or (b)
    // the upstream sales feed is empty for the lookback window, which
    // is the usual culprit and the user can't fix from this screen.
    const looksLikeDataGap = sheet.unmatchedForecast.length === 0
    return (
      <EmptyState
        venue={venue}
        title={
          looksLikeDataGap
            ? "No sales data for the forecast window"
            : "Nothing to prep this date"
        }
        body={
          looksLikeDataGap
            ? "The prep sheet builds from the last 4 same-weekday sales. No matching sales are in the database for the lookback window, which usually means the POS sync is behind. Ask a manager to check Lightspeed sync."
            : "No same-weekday sales matched a preparation. Either nothing on the menu uses a tracked prep, or component recipes need to be filled in."
        }
      />
    )
  }

  if (finished) {
    return (
      <FinishedState
        venue={venue}
        forDate={sheet.forDate}
        done={done}
        skipped={skipped}
        busy={saving}
        error={error}
        onReset={() => {
          setError("")
          startSave(async () => {
            try {
              await resetPrepWalk(venue, sheet.forDate)
              setStatuses({})
              setIndex(0)
            } catch {
              setError(OFFLINE_MESSAGE)
            }
          })
        }}
      />
    )
  }

  // Skip past anything that's already actioned (e.g. user navigated back via
  // the prev button and now wants to continue forward).
  let visibleIndex = index
  while (
    visibleIndex < lines.length &&
    statuses[lines[visibleIndex].preparationId] != null
  ) {
    visibleIndex++
  }
  if (visibleIndex >= lines.length) {
    // We ran past the end with no remaining, shouldn't happen because the
    // `finished` branch above catches it, but guard anyway.
    visibleIndex = lines.findIndex(
      (l) => statuses[l.preparationId] == null,
    )
    if (visibleIndex < 0) visibleIndex = lines.length - 1
  }

  const current = lines[visibleIndex]
  const venueLabel =
    venue === "BURLEIGH"
      ? "Burleigh"
      : venue === "BEACH_HOUSE"
        ? "Beach House"
        : "Tea Garden"

  function mark(status: Status) {
    const id = current.preparationId
    const before = statuses
    // Move on immediately; the write happens behind the next card.
    setStatuses({ ...statuses, [id]: status })
    setIndex(visibleIndex + 1)
    setError("")
    startSave(async () => {
      try {
        await setPrepWalkTick({
          venue,
          forDate: sheet.forDate,
          preparationId: id,
          status,
          by: name,
        })
      } catch {
        setStatuses(before)
        setIndex(visibleIndex)
        setError(`${OFFLINE_MESSAGE} Your last tap on ${current.preparationName} didn't stick.`)
      }
    })
  }

  function back() {
    // Step back to the most recent actioned line and clear its status so the
    // chef can redo a tap they made by accident.
    for (let i = visibleIndex - 1; i >= 0; i--) {
      const id = lines[i].preparationId
      if (statuses[id] != null) {
        const before = statuses
        const next = { ...statuses }
        delete next[id]
        setStatuses(next)
        setIndex(i)
        setError("")
        startSave(async () => {
          try {
            await clearPrepWalkTick({ venue, forDate: sheet.forDate, preparationId: id })
          } catch {
            setStatuses(before)
            setError(OFFLINE_MESSAGE)
          }
        })
        return
      }
    }
  }

  return (
    <div className="space-y-6">
      <ProgressBar
        done={done}
        skipped={skipped}
        total={lines.length}
        venueLabel={venueLabel}
        forDate={sheet.forDate}
        name={name}
        onName={setName}
        saving={saving}
      />

      {error ? (
        <p role="alert" className="rounded-[14px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[15px] font-medium text-[var(--tk-warn)]">
          {error}
        </p>
      ) : null}

      <PrepCard line={current} />

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
        <button
          onClick={() => mark("SKIPPED")}
          className="flex min-h-[72px] items-center justify-center gap-3 rounded-[18px] border border-[var(--tk-line)] bg-white px-6 text-[18px] font-semibold text-[var(--tk-charcoal)] transition active:scale-[0.985]"
        >
          <SkipForward className="h-5 w-5" />
          Skip, have enough
        </button>
        <button
          onClick={() => mark("DONE")}
          className="flex min-h-[72px] items-center justify-center gap-3 rounded-[18px] px-6 text-[18px] font-semibold text-white transition active:scale-[0.985]"
          style={{ background: "var(--tk-done)" }}
        >
          <Check className="h-5 w-5" />
          Mark done
        </button>
      </div>

      <div className="flex items-center justify-between text-[13px]">
        <button
          onClick={back}
          disabled={done + skipped === 0}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 font-medium text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-bg)] disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Undo last
        </button>
        <button
          onClick={() => mark("SKIPPED")}
          className="inline-flex min-h-[40px] items-center gap-1 rounded-full px-3 font-medium text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-bg)]"
        >
          Skip & next
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function ProgressBar({
  done,
  skipped,
  total,
  venueLabel,
  forDate,
  name,
  onName,
  saving,
}: {
  done: number
  skipped: number
  total: number
  venueLabel: string
  forDate: string
  name: string
  onName: (v: string) => void
  saving: boolean
}) {
  const pct = total === 0 ? 0 : Math.round(((done + skipped) / total) * 100)
  const human = new Date(forDate).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
  return (
    <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5">
      <div className="flex items-center justify-between text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)]">
        <span>
          {venueLabel} · {human}
        </span>
        <span className="inline-flex items-center gap-2 tabular-nums">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {done + skipped} of {total}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--tk-line)]">
        <div
          className="h-full rounded-full transition-[width] duration-300"
          style={{
            width: `${pct}%`,
            background: "var(--tk-done)",
          }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] tabular-nums">
        <span className="text-[var(--tk-done)]">
          ✓ Done {done}
        </span>
        <span className="text-[var(--tk-ink-soft)]">
          → Skipped {skipped}
        </span>
        <span className="text-[var(--tk-ink-soft)]">
          Remaining {total - done - skipped}
        </span>
      </div>
      <label className="mt-4 block sm:max-w-[280px]">
        <span className="text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)]">
          On prep today
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Your name"
          autoCapitalize="words"
          className="mt-1.5 w-full rounded-[12px] border border-[var(--tk-line)] bg-[var(--tk-bg)] px-4 py-2.5 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-charcoal)]"
        />
      </label>
    </div>
  )
}

function PrepCard({ line }: { line: PrepSheetLine }) {
  const yieldLabel = `${formatQty(line.yieldPerBatch)} ${line.yieldUnit}`
  const totalLabel = `${formatQty(line.requiredBaseQty)} ${line.baseUnit}`
  const venueChips = Array.from(
    new Set(line.drivers.map((d) => shortVenue(d.venue))),
  )

  return (
    <div className="rounded-[24px] border border-[var(--tk-line)] bg-white p-6 md:p-8">
      <div
        className="tk-caps mb-3"
        style={{ color: "var(--tk-ink-mute)" }}
      >
        {line.category}
      </div>
      <h2
        className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
        style={{ fontSize: 38, fontWeight: 600, letterSpacing: "-0.025em" }}
      >
        {line.preparationName}
      </h2>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Batches"
          value={String(line.batchesNeeded)}
          accent="gold"
        />
        <Stat
          label="Yields"
          value={yieldLabel}
          sub="per batch"
        />
        <Stat
          label="Total needed"
          value={totalLabel}
        />
      </div>

      {line.drivers.length > 0 && (
        <div className="mt-6 rounded-[16px] bg-[var(--tk-bg)] p-4">
          <div className="flex items-center gap-1.5 text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)]">
            <Clock className="h-3.5 w-3.5" />
            Driven by
          </div>
          <ul className="mt-2 space-y-1">
            {line.drivers.slice(0, 6).map((d, i) => (
              <li
                key={`${d.dishName}-${i}`}
                className="flex items-center justify-between gap-3 text-[14px]"
              >
                <span className="truncate text-[var(--tk-charcoal)]">
                  {d.dishName}
                </span>
                <span className="shrink-0 tabular-nums text-[var(--tk-ink-soft)]">
                  {formatQty(d.forecastQty)} · {shortVenue(d.venue)}
                </span>
              </li>
            ))}
            {line.drivers.length > 6 && (
              <li className="text-[12px] text-[var(--tk-ink-soft)]">
                +{line.drivers.length - 6} more dishes
              </li>
            )}
          </ul>
          {venueChips.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {venueChips.map((v) => (
                <span
                  key={v}
                  className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-medium text-[var(--tk-ink-soft)]"
                >
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: string
  sub?: string
  accent?: "gold"
}) {
  const valueColor =
    accent === "gold" ? "var(--tk-charcoal)" : "var(--tk-charcoal)"
  const bg = accent === "gold" ? "var(--tk-gold-soft)" : "var(--tk-bg)"
  return (
    <div
      className="rounded-[16px] p-4"
      style={{ background: bg }}
    >
      <div
        className="text-[12px] font-medium uppercase tracking-widest"
        style={{ color: "var(--tk-ink-soft)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 tabular-nums"
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: valueColor,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          className="mt-0.5 text-[12px]"
          style={{ color: "var(--tk-ink-soft)" }}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

function FinishedState({
  venue,
  forDate,
  done,
  skipped,
  busy,
  error,
  onReset,
}: {
  venue: Venue
  forDate: string
  done: number
  skipped: number
  busy: boolean
  error: string
  onReset: () => void
}) {
  const human = new Date(forDate).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "short",
  })
  return (
    <div className="rounded-[24px] border border-[var(--tk-line)] bg-white p-10 text-center">
      <div
        className="tk-display text-[var(--tk-done)]"
        style={{ fontSize: 56, fontWeight: 700, letterSpacing: "-0.03em" }}
      >
        All done!
      </div>
      <p className="mt-3 text-[16px] text-[var(--tk-ink-soft)]">
        {human} prep: {done} made, {skipped} skipped. Saved, so it reads the same on every device.
      </p>
      {error ? (
        <p role="alert" className="mx-auto mt-3 max-w-md rounded-[14px] bg-[var(--tk-warn-soft)] px-4 py-3 text-[15px] font-medium text-[var(--tk-warn)]">
          {error}
        </p>
      ) : null}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          onClick={onReset}
          disabled={busy}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-[var(--tk-line)] bg-white px-5 text-[14px] font-medium text-[var(--tk-charcoal)] hover:bg-[var(--tk-bg)] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          Run again
        </button>
        <a
          href={`/kitchen?venue=${venue}`}
          className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white"
          style={{ background: "var(--tk-charcoal)" }}
        >
          Back to kitchen
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  )
}

function EmptyState({
  title,
  body,
  venue,
}: {
  title: string
  body: string
  venue: Venue
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center">
      <p className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
        {title}
      </p>
      <p className="mx-auto mt-3 max-w-xl text-[14px] leading-snug text-[var(--tk-ink-soft)]">
        {body}
      </p>
      <a
        href={`/kitchen?venue=${venue}`}
        className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white"
        style={{ background: "var(--tk-charcoal)" }}
      >
        Back to kitchen
        <ArrowRight className="h-4 w-4" />
      </a>
    </div>
  )
}

function formatQty(n: number): string {
  // 1.234 → "1.23", 12.3 → "12.3", 123 → "123"
  if (n === 0) return "0"
  if (n < 1) return n.toFixed(2)
  if (n < 10) return n.toFixed(1)
  return Math.round(n).toLocaleString()
}

function shortVenue(v: string): string {
  if (v === "BURLEIGH") return "Burleigh"
  if (v === "BEACH_HOUSE") return "BH"
  if (v === "TEA_GARDEN") return "TG"
  return v
}
