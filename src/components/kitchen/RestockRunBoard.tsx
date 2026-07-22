"use client"

import { useState } from "react"
import { ArrowRight, Check, Flag, Loader2, Star } from "lucide-react"
import {
  completeRestockRun,
  supplyRunLine,
  type RestockRun,
  type RunStationLine,
} from "@/lib/actions/restock"
import { STATION_SHORT_LABEL } from "@/lib/stations"

/**
 * The prep chef's consolidated morning list. Every requested line from all
 * submitted evening counts, grouped by item — priority flags first. Tick a
 * station chip to log "delivered as requested"; long-tap/edit for partial.
 */
export function RestockRunBoard({ initialRun }: { initialRun: RestockRun }) {
  const [run, setRun] = useState(initialRun)
  const [name, setName] = useState("")
  const [finishing, setFinishing] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const allLines = run.items.flatMap((i) => i.stations)
  const suppliedLines = allLines.filter((l) => l.supplied != null)
  const gapLines = allLines.filter((l) => l.supplied == null)

  function patchLine(lineId: string, patch: Partial<RunStationLine>) {
    setRun((prev) => ({
      ...prev,
      items: prev.items.map((item) => ({
        ...item,
        stations: item.stations.map((s) =>
          s.lineId === lineId ? { ...s, ...patch } : s
        ),
      })),
    }))
  }

  async function toggleSupplied(line: RunStationLine) {
    if (!name.trim()) {
      setError("Add your name at the top first")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    setError(null)
    const nowSupplied = line.supplied == null ? line.requested : null
    patchLine(line.lineId, {
      supplied: nowSupplied,
      suppliedBy: nowSupplied == null ? null : name.trim(),
    })
    const res = await supplyRunLine({
      lineId: line.lineId,
      supplied: nowSupplied,
      suppliedBy: name.trim(),
    })
    if (!res.ok) {
      patchLine(line.lineId, {
        supplied: line.supplied,
        suppliedBy: line.suppliedBy,
      })
      setError("Couldn't save — try again")
    }
  }

  async function adjustSupplied(line: RunStationLine) {
    if (!name.trim()) {
      setError("Add your name at the top first")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const raw = window.prompt(
      `How much did you deliver? (asked for ${line.requested})`,
      String(line.supplied ?? line.requested)
    )
    if (raw == null) return
    const n = Number(raw.trim().replace(",", "."))
    if (!Number.isFinite(n) || n < 0) return
    patchLine(line.lineId, { supplied: n, suppliedBy: name.trim() })
    const res = await supplyRunLine({
      lineId: line.lineId,
      supplied: n,
      suppliedBy: name.trim(),
    })
    if (!res.ok) setError("Couldn't save — try again")
  }

  async function handleFinish() {
    if (!name.trim()) {
      setError("Add your name to finish the run")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    if (gapLines.length > 0) {
      const ok = window.confirm(
        `${gapLines.length} requested line${gapLines.length === 1 ? " has" : "s have"} nothing logged as delivered. Finish anyway? They'll show as shortfalls on the daily report.`
      )
      if (!ok) return
    }
    setFinishing(true)
    setError(null)
    const res = await completeRestockRun({
      venue: run.venue,
      restockedBy: name.trim(),
    })
    setFinishing(false)
    if (res.ok) setFinished(true)
    else setError(res.error ?? "Couldn't finish — try again")
  }

  if (run.items.length === 0 && !finished) {
    return (
      <div className="rounded-[24px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center">
        <p className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
          No counts waiting
        </p>
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-snug text-[var(--tk-ink-soft)]">
          {run.sheets.length > 0
            ? "The submitted counts didn't request anything — all kitchens are stocked."
            : "No kitchen has sent an evening count yet. Once a closing chef submits one, it lands here."}
        </p>
        <a
          href={`/kitchen/restock?venue=${run.venue}`}
          className="mt-5 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white"
          style={{ background: "var(--tk-charcoal)" }}
        >
          Back to restock
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    )
  }

  if (finished) {
    return (
      <div className="rounded-[24px] border border-[var(--tk-line)] bg-white p-10 text-center">
        <div
          className="tk-display text-[var(--tk-done)]"
          style={{ fontSize: 48, fontWeight: 700, letterSpacing: "-0.03em" }}
        >
          Run complete ✓
        </div>
        <p className="mt-3 text-[16px] text-[var(--tk-ink-soft)]">
          {suppliedLines.length} line{suppliedLines.length === 1 ? "" : "s"}{" "}
          delivered
          {gapLines.length > 0
            ? ` · ${gapLines.length} shortfall${gapLines.length === 1 ? "" : "s"} flagged`
            : " · no shortfalls"}
          . The daily prep stock report is ready.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`/kitchen/restock/report?venue=${run.venue}`}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-[14px] font-medium text-white"
            style={{ background: "var(--tk-charcoal)" }}
          >
            View today&apos;s report
            <ArrowRight className="h-4 w-4" />
          </a>
          <a
            href={`/kitchen/restock?venue=${run.venue}`}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--tk-line)] bg-white px-5 py-2.5 text-[14px] font-medium text-[var(--tk-charcoal)] hover:bg-[var(--tk-bg)]"
          >
            Back to restock
          </a>
        </div>
      </div>
    )
  }

  const priorityItems = run.items.filter((i) => i.priority)
  const normalItems = run.items.filter((i) => !i.priority)

  return (
    <div className="space-y-6 pb-24">
      {/* Who's running + progress */}
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name (prep chef)"
            autoCapitalize="words"
            className="min-h-[52px] flex-1 rounded-[14px] border border-[var(--tk-line)] bg-white px-4 text-[16px] text-[var(--tk-charcoal)] outline-none focus:border-[var(--tk-sage)]"
          />
          <div className="text-[13px] tabular-nums text-[var(--tk-ink-soft)]">
            {suppliedLines.length} of {allLines.length} lines delivered ·{" "}
            {run.sheets
              .map(
                (s) =>
                  `${STATION_SHORT_LABEL[s.station]}${s.countedBy ? ` (${s.countedBy})` : ""}`
              )
              .join(" + ")}
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "#fdecec", color: "#b3261e" }}
        >
          {error}
        </div>
      )}

      {priorityItems.length > 0 && (
        <div className="space-y-2">
          <div
            className="tk-caps flex items-center gap-1.5 px-1"
            style={{ color: "#8a6d1f" }}
          >
            <Star className="h-3.5 w-3.5" fill="var(--tk-gold)" stroke="var(--tk-gold)" />
            Priority first
          </div>
          {priorityItems.map((item) => (
            <RunItemCard
              key={item.name}
              item={item}
              onToggle={toggleSupplied}
              onAdjust={adjustSupplied}
            />
          ))}
        </div>
      )}

      {normalItems.length > 0 && (
        <div className="space-y-2">
          {priorityItems.length > 0 && (
            <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
              Everything else
            </div>
          )}
          {normalItems.map((item) => (
            <RunItemCard
              key={item.name}
              item={item}
              onToggle={toggleSupplied}
              onAdjust={adjustSupplied}
            />
          ))}
        </div>
      )}

      {/* Finish */}
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-[14px] text-[var(--tk-ink-soft)]">
            {gapLines.length === 0 ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[var(--tk-done)]">
                <Check className="h-4 w-4" /> Every requested line logged
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Flag className="h-4 w-4" />
                {gapLines.length} line{gapLines.length === 1 ? "" : "s"} not
                logged yet
              </span>
            )}
          </div>
          <button
            onClick={handleFinish}
            disabled={finishing}
            className="flex min-h-[56px] items-center justify-center gap-2.5 rounded-[14px] px-8 text-[17px] font-semibold text-white transition active:scale-[0.985] disabled:opacity-40"
            style={{ background: "var(--tk-done)" }}
          >
            {finishing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Check className="h-5 w-5" />
            )}
            Finish restock run
          </button>
        </div>
      </div>
    </div>
  )
}

function RunItemCard({
  item,
  onToggle,
  onAdjust,
}: {
  item: RestockRun["items"][number]
  onToggle: (line: RunStationLine) => void
  onAdjust: (line: RunStationLine) => void
}) {
  const multiStation = item.stations.length > 1
  const allDone = item.stations.every((s) => s.supplied != null)

  return (
    <div
      className="rounded-[18px] border bg-white p-4"
      style={{
        borderColor: allDone ? "var(--tk-done)" : "var(--tk-line)",
        opacity: allDone ? 0.75 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {item.priority && (
              <Star
                className="h-4 w-4 shrink-0"
                fill="var(--tk-gold)"
                stroke="var(--tk-gold)"
              />
            )}
            <span
              className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              {item.name}
            </span>
            {item.unit && (
              <span className="text-[13px] text-[var(--tk-ink-soft)]">
                {item.unit}
              </span>
            )}
          </div>
          {multiStation && (
            <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
              Both kitchens — make{" "}
              <strong className="text-[var(--tk-charcoal)]">
                {formatQty(item.totalRequested)}
              </strong>{" "}
              total, split below
            </div>
          )}
        </div>
        {allDone && (
          <span
            className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold"
            style={{ background: "var(--tk-done-soft)", color: "var(--tk-done)" }}
          >
            Done
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {item.stations.map((s) => {
          const done = s.supplied != null
          const partial = done && s.supplied! < s.requested
          return (
            <div
              key={s.lineId}
              className="flex items-center gap-3 rounded-[14px] px-3 py-2.5"
              style={{ background: "var(--tk-bg)" }}
            >
              <button
                onClick={() => onToggle(s)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition active:scale-90"
                style={{
                  borderColor: done ? "var(--tk-done)" : "var(--tk-ink-mute)",
                  background: done ? "var(--tk-done)" : "transparent",
                  color: "#fff",
                }}
                aria-label={`Mark ${item.name} for ${STATION_SHORT_LABEL[s.station]} delivered`}
              >
                {done && <Check className="h-5 w-5" strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium text-[var(--tk-charcoal)]">
                  {STATION_SHORT_LABEL[s.station]} — needs{" "}
                  <span className="tabular-nums">{formatQty(s.requested)}</span>
                  {s.available != null && (
                    <span className="ml-1.5 text-[13px] font-normal text-[var(--tk-ink-soft)]">
                      ({formatQty(s.available)} left at close)
                    </span>
                  )}
                </div>
                {s.note && (
                  <div className="text-[13px] italic text-[var(--tk-ink-soft)]">
                    “{s.note}”
                  </div>
                )}
                {partial && (
                  <div
                    className="text-[13px] font-medium"
                    style={{ color: "#8a6d1f" }}
                  >
                    Delivered {formatQty(s.supplied!)} of{" "}
                    {formatQty(s.requested)}
                  </div>
                )}
              </div>
              <button
                onClick={() => onAdjust(s)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium text-[var(--tk-ink-soft)] transition hover:bg-white"
              >
                {done ? "Edit qty" : "Partial…"}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n)
  return n.toFixed(1).replace(/\.0$/, "")
}
