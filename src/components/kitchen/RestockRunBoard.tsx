"use client"

import { useState } from "react"
import { ArrowRight, Check, Flag, History, Loader2, Star } from "lucide-react"
import {
  clearStaleRunSheet,
  completeRestockRun,
  supplyRunLine,
  type RestockRun,
  type RunStationLine,
} from "@/lib/actions/restock"
import { STATION_SHORT_LABEL } from "@/lib/stations"
import type { KitchenStation } from "@/generated/prisma/client"

type StationFilter = KitchenStation | "ALL"

function todayAestYmd(): string {
  return new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString().split("T")[0]
}

/** "Wed 23 Jul" for a yyyy-mm-dd string. */
function shortDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  })
}

function nightLabel(ymd: string, today: string): string {
  if (ymd >= today) return "tonight's count"
  const days = Math.round(
    (Date.parse(today) - Date.parse(ymd)) / (24 * 60 * 60 * 1000)
  )
  if (days === 1) return "last night"
  return shortDate(ymd)
}

/**
 * The prep chef's consolidated morning list. Every requested line from all
 * submitted evening counts, grouped by item — priority flags first. Tick a
 * station chip to log "delivered as requested"; long-tap/edit for partial.
 * At Beach House the Restaurant/Cafe toggle filters to one kitchen's
 * requests — items both kitchens asked for stay visible in either view so
 * the batch still gets made once and split.
 */
export function RestockRunBoard({
  initialRun,
  initialStation = "ALL",
}: {
  initialRun: RestockRun
  initialStation?: StationFilter
}) {
  const [run, setRun] = useState(initialRun)
  const [name, setName] = useState("")
  const [stationFilter, setStationFilter] = useState<StationFilter>(initialStation)
  const [finishing, setFinishing] = useState(false)
  const [finished, setFinished] = useState(false)
  const [clearing, setClearing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const today = todayAestYmd()
  const allLines = run.items.flatMap((i) => i.stations)
  const suppliedLines = allLines.filter((l) => l.supplied != null)
  const gapLines = allLines.filter((l) => l.supplied == null)

  // The newest count in the run is "current"; anything older stacked under
  // it (the finish step was skipped), or older than last night outright,
  // gets flagged for clearing.
  const latestDate = run.sheets.reduce(
    (max, s) => (s.sheetDate > max ? s.sheetDate : max),
    ""
  )
  const yesterday = new Date(Date.parse(today) - 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0]
  const oldSheets = run.sheets.filter(
    (s) =>
      (s.sheetDate < latestDate || s.sheetDate < yesterday) &&
      s.sheetDate < today
  )

  const stationsInRun = Array.from(
    new Set(run.sheets.map((s) => s.station))
  ).sort()
  const showToggle = stationsInRun.length > 1

  function selectStation(v: StationFilter) {
    setStationFilter(v)
    const url = new URL(window.location.href)
    if (v === "ALL") url.searchParams.delete("station")
    else url.searchParams.set("station", v)
    window.history.replaceState(null, "", url)
  }

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

  async function clearSheet(sheetId: string) {
    if (!name.trim()) {
      setError("Add your name at the top first")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    const sheet = run.sheets.find((s) => s.sheetId === sheetId)
    const ok = window.confirm(
      `Clear the ${sheet ? STATION_SHORT_LABEL[sheet.station] : ""} count from ${sheet ? shortDate(sheet.sheetDate) : "that night"}? Its requests come off this run — anything not delivered shows as a shortfall on that day's report.`
    )
    if (!ok) return
    setClearing(sheetId)
    setError(null)
    const res = await clearStaleRunSheet({ sheetId, clearedBy: name.trim() })
    setClearing(null)
    if (!res.ok) {
      setError(res.error ?? "Couldn't clear — try again")
      return
    }
    setRun((prev) => ({
      ...prev,
      sheets: prev.sheets.filter((s) => s.sheetId !== sheetId),
      items: prev.items
        .map((item) => {
          const stations = item.stations.filter((l) => l.sheetId !== sheetId)
          return {
            ...item,
            stations,
            totalRequested: stations.reduce((t, l) => t + l.requested, 0),
            totalSupplied: stations.reduce((t, l) => t + (l.supplied ?? 0), 0),
          }
        })
        .filter((item) => item.stations.length > 0),
    }))
  }

  async function handleFinish() {
    if (!name.trim()) {
      setError("Add your name to finish the run")
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }
    if (gapLines.length > 0) {
      const ok = window.confirm(
        `${gapLines.length} requested line${gapLines.length === 1 ? " has" : "s have"} nothing logged as delivered${stationFilter !== "ALL" ? " (across BOTH kitchens, not just the one you're viewing)" : ""}. Finish anyway? They'll show as shortfalls on the daily report.`
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
            ? "The counts didn't request anything — all kitchens are stocked."
            : "No kitchen has entered an evening count yet. As soon as a closing chef starts one it lands here, even if they forget to tap Send."}
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

  const visibleItems =
    stationFilter === "ALL"
      ? run.items
      : run.items.filter((i) =>
          i.stations.some((s) => s.station === stationFilter)
        )
  const priorityItems = visibleItems.filter((i) => i.priority)
  const normalItems = visibleItems.filter((i) => !i.priority)

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
                  `${STATION_SHORT_LABEL[s.station]} ${nightLabel(s.sheetDate, today)}${s.countedBy ? ` (${s.countedBy})` : ""}${s.sent ? "" : " — not sent"}`
              )
              .join(" + ")}
          </div>
        </div>
        {run.sheets.some((s) => !s.sent) && (
          <p className="mt-2 text-[13px]" style={{ color: "#8a6d1f" }}>
            A count marked &ldquo;not sent&rdquo; was never sent by the closing
            chef — it&apos;s included anyway so nothing is lost. Double-check it
            looks finished before you rely on it.
          </p>
        )}
      </div>

      {/* Old counts that never got closed out */}
      {oldSheets.length > 0 && (
        <div
          className="rounded-[20px] border p-5"
          style={{ borderColor: "#e3cf96", background: "#fdf6e3" }}
        >
          <div
            className="flex items-center gap-1.5 text-[14px] font-semibold"
            style={{ color: "#8a6d1f" }}
          >
            <History className="h-4 w-4" />
            Old counts are stacked on this run
          </div>
          <p className="mt-1 text-[13px] leading-snug" style={{ color: "#8a6d1f" }}>
            These earlier nights were never finished, so their requests are
            added on top of the newest count. If they were already handled,
            clear them — undelivered lines go down as shortfalls on their own
            day&apos;s report.
          </p>
          <div className="mt-3 space-y-2">
            {oldSheets.map((s) => (
              <div
                key={s.sheetId}
                className="flex items-center justify-between gap-3 rounded-[14px] bg-white px-4 py-2.5"
              >
                <div className="text-[14px] text-[var(--tk-charcoal)]">
                  <span className="font-medium">
                    {STATION_SHORT_LABEL[s.station]} — {shortDate(s.sheetDate)}
                  </span>{" "}
                  <span className="text-[var(--tk-ink-soft)]">
                    {s.countedBy ? `by ${s.countedBy} · ` : ""}
                    {s.lineCount} request{s.lineCount === 1 ? "" : "s"}
                  </span>
                </div>
                <button
                  onClick={() => clearSheet(s.sheetId)}
                  disabled={clearing === s.sheetId}
                  className="shrink-0 rounded-full border px-4 py-1.5 text-[13px] font-medium transition active:scale-95 disabled:opacity-40"
                  style={{ borderColor: "#e3cf96", color: "#8a6d1f" }}
                >
                  {clearing === s.sheetId ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Clear"
                  )}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kitchen filter — Beach House runs two kitchens */}
      {showToggle && (
        <div className="flex flex-wrap items-center gap-3 px-1">
          <div className="inline-flex rounded-full border border-[var(--tk-line)] bg-white p-1">
            {(["ALL", ...stationsInRun] as StationFilter[]).map((v) => {
              const active = stationFilter === v
              const count =
                v === "ALL"
                  ? run.items.length
                  : run.items.filter((i) =>
                      i.stations.some((s) => s.station === v)
                    ).length
              return (
                <button
                  key={v}
                  onClick={() => selectStation(v)}
                  className="min-h-[44px] rounded-full px-5 text-[15px] font-medium transition"
                  style={{
                    background: active ? "var(--tk-charcoal)" : "transparent",
                    color: active ? "#fff" : "var(--tk-ink-soft)",
                  }}
                >
                  {v === "ALL" ? "All" : STATION_SHORT_LABEL[v]}{" "}
                  <span className="tabular-nums opacity-70">({count})</span>
                </button>
              )
            })}
          </div>
          {stationFilter !== "ALL" && (
            <span className="text-[13px] text-[var(--tk-ink-soft)]">
              Items the other kitchen also asked for stay listed — make once,
              split the batch.
            </span>
          )}
        </div>
      )}

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
            Priority — work top to bottom
          </div>
          {priorityItems.map((item) => (
            <RunItemCard
              key={item.name}
              item={item}
              today={today}
              latestDate={latestDate}
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
              today={today}
              latestDate={latestDate}
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
                {stationFilter !== "ALL" ? " across both kitchens" : ""}
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
        {stationFilter !== "ALL" && (
          <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
            Finishing closes the whole run for both kitchens, not just{" "}
            {STATION_SHORT_LABEL[stationFilter]}.
          </p>
        )}
      </div>
    </div>
  )
}

function RunItemCard({
  item,
  today,
  latestDate,
  onToggle,
  onAdjust,
}: {
  item: RestockRun["items"][number]
  today: string
  latestDate: string
  onToggle: (line: RunStationLine) => void
  onAdjust: (line: RunStationLine) => void
}) {
  const distinctStations = new Set(item.stations.map((s) => s.station))
  const multiKitchen = distinctStations.size > 1
  const repeatNights = item.stations.length > distinctStations.size
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
            {item.priorityRank != null ? (
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-bold tabular-nums"
                style={{ background: "var(--tk-gold)", color: "#5d4a12" }}
              >
                {item.priorityRank}
              </span>
            ) : item.priority ? (
              <Star
                className="h-4 w-4 shrink-0"
                fill="var(--tk-gold)"
                stroke="var(--tk-gold)"
              />
            ) : null}
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
          {multiKitchen && (
            <div className="mt-0.5 text-[13px] text-[var(--tk-ink-soft)]">
              Both kitchens — make{" "}
              <strong className="text-[var(--tk-charcoal)]">
                {formatQty(item.totalRequested)}
              </strong>{" "}
              total, split below
            </div>
          )}
          {repeatNights && (
            <div className="mt-0.5 text-[13px]" style={{ color: "#8a6d1f" }}>
              Asked for on more than one night — check the older requests are
              still needed before making the lot
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
          const old = s.sheetDate < latestDate
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
                  {old && (
                    <span
                      className="ml-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                      style={{ background: "#fdf6e3", color: "#8a6d1f" }}
                    >
                      {nightLabel(s.sheetDate, today)}
                    </span>
                  )}
                  {s.available != null && (
                    <span className="ml-1.5 text-[13px] font-normal text-[var(--tk-ink-soft)]">
                      ({formatQty(s.available)} in coolroom at close)
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
