"use client"

import { useEffect, useState, useTransition } from "react"
import { Plus, Clock, Thermometer, History, Trash2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import {
  createCoolingLog,
  recordCoolingCheckpoint,
  deleteCoolingLog,
  type CoolingLogRecord,
} from "@/lib/actions/cooling"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

const TWO_HOUR_MS = 2 * 60 * 60 * 1000
const SIX_HOUR_MS = 6 * 60 * 60 * 1000

function formatAest(iso: string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(iso).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    ...opts,
  })
}

function formatElapsed(ms: number) {
  if (ms < 0) ms = 0
  const totalMin = Math.floor(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m} min`
  return `${h} hr ${m.toString().padStart(2, "0")} min`
}

/**
 * `<input type="datetime-local">` value formatted in the user's local TZ
 * (which on the iPad will be AEST). Used as the default for back-date pickers.
 */
function nowLocalIso() {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function CoolingDashboard({
  venue,
  initialLogs,
}: {
  venue: Venue
  initialLogs: CoolingLogRecord[]
}) {
  const [logs] = useState(initialLogs)
  const [now, setNow] = useState(() => Date.now())
  const [openForm, setOpenForm] = useState<null | "start" | "late">(null)
  const [openCheckpoint, setOpenCheckpoint] = useState<null | {
    log: CoolingLogRecord
    checkpoint: "TWO_HOUR" | "SIX_HOUR"
  }>(null)

  // Live elapsed counters re-render every minute.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])

  const inProgress = logs.filter((l) => l.status !== "COMPLETE")
  const complete = logs.filter((l) => l.status === "COMPLETE")

  return (
    <div className="space-y-8">
      {/* Action bar */}
      <div className="flex flex-wrap gap-3">
        <KitchenButton
          variant="primary"
          size="lg"
          onClick={() => setOpenForm("start")}
        >
          <Plus className="h-5 w-5" />
          Start cooling
        </KitchenButton>
        <KitchenButton
          variant="secondary"
          size="lg"
          onClick={() => setOpenForm("late")}
        >
          <History className="h-5 w-5" />
          Add previous batch
        </KitchenButton>
      </div>

      {/* In progress */}
      <section>
        <h2
          className="tk-caps mb-3"
          style={{ color: "var(--tk-ink-soft)", fontSize: 12 }}
        >
          In progress · {inProgress.length}
        </h2>
        {inProgress.length === 0 ? (
          <EmptyState text="No batches currently cooling. Hit Start cooling when an item leaves the heat." />
        ) : (
          <div className="space-y-3">
            {inProgress.map((log) => (
              <InProgressCard
                key={log.id}
                log={log}
                now={now}
                onRecord={(checkpoint) => setOpenCheckpoint({ log, checkpoint })}
              />
            ))}
          </div>
        )}
      </section>

      {/* Complete (last 24h) */}
      <section>
        <h2
          className="tk-caps mb-3"
          style={{ color: "var(--tk-ink-soft)", fontSize: 12 }}
        >
          Completed (last 24 hr) · {complete.length}
        </h2>
        {complete.length === 0 ? (
          <EmptyState text="No completed cooling logs in the last 24 hours yet." />
        ) : (
          <div className="space-y-2">
            {complete.map((log) => (
              <CompletedRow key={log.id} log={log} />
            ))}
          </div>
        )}
      </section>

      {openForm === "start" && (
        <StartForm
          venue={venue}
          mode="now"
          onClose={() => setOpenForm(null)}
        />
      )}
      {openForm === "late" && (
        <StartForm
          venue={venue}
          mode="late"
          onClose={() => setOpenForm(null)}
        />
      )}
      {openCheckpoint && (
        <CheckpointForm
          log={openCheckpoint.log}
          checkpoint={openCheckpoint.checkpoint}
          onClose={() => setOpenCheckpoint(null)}
        />
      )}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-8 text-center text-[14px] text-[var(--tk-ink-soft)]">
      {text}
    </div>
  )
}

function InProgressCard({
  log,
  now,
  onRecord,
}: {
  log: CoolingLogRecord
  now: number
  onRecord: (checkpoint: "TWO_HOUR" | "SIX_HOUR") => void
}) {
  const startMs = new Date(log.startedAt).getTime()
  const elapsed = now - startMs
  const twoDue = elapsed >= TWO_HOUR_MS && log.twoHourTempC === null
  const sixDue = elapsed >= SIX_HOUR_MS && log.sixHourTempC === null
  const overdue = log.status === "OVERDUE"

  const nextCheckpoint: "TWO_HOUR" | "SIX_HOUR" =
    log.twoHourTempC === null ? "TWO_HOUR" : "SIX_HOUR"
  const nextDueMs = nextCheckpoint === "TWO_HOUR" ? TWO_HOUR_MS : SIX_HOUR_MS
  const remaining = startMs + nextDueMs - now

  return (
    <div
      className="rounded-[16px] border bg-white px-5 py-4"
      style={{
        borderColor: overdue ? "var(--tk-warn)" : "var(--tk-line)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <div
              className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              {log.itemName}
            </div>
            {log.batchSize && (
              <span className="text-[13px] text-[var(--tk-ink-soft)]">
                · {log.batchSize}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--tk-ink-soft)]">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              Started{" "}
              {formatAest(log.startedAt, {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })}{" "}
              ({formatElapsed(elapsed)} ago)
            </span>
            {log.startTempC !== null && (
              <span className="inline-flex items-center gap-1">
                <Thermometer className="h-3.5 w-3.5" />
                Start {log.startTempC}°C
              </span>
            )}
            <span>by {log.staffInitials}</span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="rounded-full px-3 py-1 text-[12px] font-semibold"
            style={
              overdue
                ? { background: "var(--tk-warn-soft)", color: "var(--tk-warn)" }
                : {
                    background: "var(--tk-gold-soft)",
                    color: "#8a6d1f",
                  }
            }
          >
            {overdue
              ? "Overdue"
              : remaining > 0
                ? `Next check in ${formatElapsed(remaining)}`
                : `${nextCheckpoint === "TWO_HOUR" ? "2-hr" : "6-hr"} check due`}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <CheckpointPill
          label="2-hour check"
          target="≤ 21 °C"
          tempC={log.twoHourTempC}
          at={log.twoHourAt}
          dueNow={twoDue}
          fail={log.twoHourTempC !== null && log.twoHourTempC > 21}
          onClick={
            log.twoHourTempC === null ? () => onRecord("TWO_HOUR") : undefined
          }
        />
        <CheckpointPill
          label="6-hour check"
          target="≤ 5 °C"
          tempC={log.sixHourTempC}
          at={log.sixHourAt}
          dueNow={sixDue}
          fail={log.sixHourTempC !== null && log.sixHourTempC > 5}
          onClick={
            log.sixHourTempC === null && log.twoHourTempC !== null
              ? () => onRecord("SIX_HOUR")
              : undefined
          }
          disabled={log.twoHourTempC === null}
        />
      </div>
      {log.notes && (
        <div className="mt-3 rounded-[10px] bg-[var(--tk-bg)] px-3 py-2 text-[13px] text-[var(--tk-ink-soft)]">
          {log.notes}
        </div>
      )}
    </div>
  )
}

function CheckpointPill({
  label,
  target,
  tempC,
  at,
  dueNow,
  fail,
  disabled,
  onClick,
}: {
  label: string
  target: string
  tempC: number | null
  at: string | null
  dueNow: boolean
  fail: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  const recorded = tempC !== null
  const bg = recorded
    ? fail
      ? "var(--tk-warn-soft)"
      : "var(--tk-done-soft)"
    : dueNow
      ? "var(--tk-gold-soft)"
      : "var(--tk-bg)"
  const fg = recorded
    ? fail
      ? "var(--tk-warn)"
      : "var(--tk-done)"
    : "var(--tk-ink-soft)"

  const base = (
    <div
      className="flex items-center justify-between rounded-[12px] px-4 py-3 text-left"
      style={{
        background: bg,
        color: fg,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <div>
        <div className="text-[13px] font-semibold">{label}</div>
        <div className="text-[12px] opacity-80">Target {target}</div>
      </div>
      <div className="text-right tabular-nums">
        {recorded ? (
          <>
            <div className="text-[18px] font-bold leading-none">{tempC}°C</div>
            <div className="mt-1 text-[11px] opacity-80">
              {at &&
                formatAest(at, {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                })}
              {fail && " · over target"}
            </div>
          </>
        ) : (
          <div className="text-[12px] font-semibold uppercase tracking-wider">
            {dueNow ? "Tap to record" : "Not yet"}
          </div>
        )}
      </div>
    </div>
  )

  if (onClick && !disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="block w-full rounded-[12px] transition active:scale-[0.99]"
      >
        {base}
      </button>
    )
  }
  return base
}

function CompletedRow({ log }: { log: CoolingLogRecord }) {
  const twoFail = log.twoHourTempC !== null && log.twoHourTempC > 21
  const sixFail = log.sixHourTempC !== null && log.sixHourTempC > 5
  const anyFail = twoFail || sixFail
  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border bg-white px-4 py-3"
      style={{ borderColor: "var(--tk-line)" }}
    >
      <div className="min-w-0">
        <div className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
          {log.itemName}
          {log.batchSize && (
            <span className="text-[13px] font-normal text-[var(--tk-ink-soft)]">
              {" "}
              · {log.batchSize}
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[12px] text-[var(--tk-ink-soft)]">
          Started{" "}
          {formatAest(log.startedAt, {
            weekday: "short",
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
          })}{" "}
          · by {log.staffInitials}
        </div>
      </div>
      <div className="flex items-center gap-3 tabular-nums text-[13px]">
        <span style={{ color: twoFail ? "var(--tk-warn)" : "var(--tk-done)" }}>
          2hr {log.twoHourTempC ?? "—"}°C
        </span>
        <span style={{ color: sixFail ? "var(--tk-warn)" : "var(--tk-done)" }}>
          6hr {log.sixHourTempC ?? "—"}°C
        </span>
        {anyFail && (
          <span
            className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
            style={{ background: "var(--tk-warn-soft)", color: "var(--tk-warn)" }}
          >
            Out of target
          </span>
        )}
      </div>
    </div>
  )
}

function FormShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] rounded-t-[24px] bg-white p-6 sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="tk-display mb-4 leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          {title}
        </div>
        {children}
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      className="mb-1 block text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]"
      style={{ letterSpacing: "0.08em" }}
    >
      {children}
    </label>
  )
}

const inputClass =
  "w-full rounded-[10px] border border-[var(--tk-line)] bg-white px-3 py-2.5 text-[15px] text-[var(--tk-ink)] focus:border-[var(--tk-charcoal)] focus:outline-none"

function StartForm({
  venue,
  mode,
  onClose,
}: {
  venue: Venue
  mode: "now" | "late"
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [itemName, setItemName] = useState("")
  const [batchSize, setBatchSize] = useState("")
  const [staffInitials, setStaffInitials] = useState("")
  const [startTempC, setStartTempC] = useState("")
  const [startedAt, setStartedAt] = useState(nowLocalIso())
  const [twoHourTempC, setTwoHourTempC] = useState("")
  const [twoHourAt, setTwoHourAt] = useState("")
  const [sixHourTempC, setSixHourTempC] = useState("")
  const [sixHourAt, setSixHourAt] = useState("")
  const [fridgeTempC, setFridgeTempC] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    if (!itemName.trim()) return setError("Item name required")
    if (!staffInitials.trim()) return setError("Name required")
    startTransition(async () => {
      try {
        await createCoolingLog({
          venue,
          itemName,
          batchSize: batchSize || null,
          staffInitials,
          startedAt: mode === "late" ? new Date(startedAt) : null,
          startTempC: startTempC ? Number(startTempC) : null,
          twoHourTempC: twoHourTempC ? Number(twoHourTempC) : null,
          twoHourAt: twoHourAt ? new Date(twoHourAt) : null,
          sixHourTempC: sixHourTempC ? Number(sixHourTempC) : null,
          sixHourAt: sixHourAt ? new Date(sixHourAt) : null,
          fridgeTempC: fridgeTempC ? Number(fridgeTempC) : null,
          notes: notes || null,
        })
        onClose()
        // Light reload so the new entry appears.
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed")
      }
    })
  }

  return (
    <FormShell
      title={mode === "late" ? "Add previous batch" : "Start cooling"}
      onClose={onClose}
    >
      <div className="space-y-3">
        <div>
          <FieldLabel>Item</FieldLabel>
          <input
            autoFocus
            className={inputClass}
            placeholder="e.g. Beef stock"
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Batch size</FieldLabel>
            <input
              className={inputClass}
              placeholder="20 L pot"
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Name</FieldLabel>
            <input
              className={inputClass}
              placeholder="First name"
              value={staffInitials}
              onChange={(e) => setStaffInitials(e.target.value)}
            />
          </div>
        </div>

        {mode === "late" && (
          <div>
            <FieldLabel>Start time (when item left heat)</FieldLabel>
            <input
              type="datetime-local"
              className={inputClass}
              value={startedAt}
              onChange={(e) => setStartedAt(e.target.value)}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Start temp (°C)</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              className={inputClass}
              placeholder="65"
              value={startTempC}
              onChange={(e) => setStartTempC(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Fridge / cool room (°C)</FieldLabel>
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              className={inputClass}
              placeholder="3"
              value={fridgeTempC}
              onChange={(e) => setFridgeTempC(e.target.value)}
            />
          </div>
        </div>

        {mode === "late" && (
          <>
            <div className="-mb-1 mt-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]">
              2-hour check (target ≤ 21°C)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Temp (°C)</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={inputClass}
                  value={twoHourTempC}
                  onChange={(e) => setTwoHourTempC(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Time</FieldLabel>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={twoHourAt}
                  onChange={(e) => setTwoHourAt(e.target.value)}
                />
              </div>
            </div>
            <div className="-mb-1 mt-2 text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]">
              6-hour check (target ≤ 5°C)
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Temp (°C)</FieldLabel>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  className={inputClass}
                  value={sixHourTempC}
                  onChange={(e) => setSixHourTempC(e.target.value)}
                />
              </div>
              <div>
                <FieldLabel>Time</FieldLabel>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={sixHourAt}
                  onChange={(e) => setSixHourAt(e.target.value)}
                />
              </div>
            </div>
          </>
        )}

        <div>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-[10px] bg-[var(--tk-warn-soft)] px-3 py-2 text-[13px] text-[var(--tk-warn)]">
            {error}
          </div>
        )}

        <div className="mt-2 flex flex-wrap justify-end gap-3 pt-2">
          <KitchenButton variant="secondary" onClick={onClose} disabled={pending}>
            Cancel
          </KitchenButton>
          <KitchenButton variant="primary" onClick={submit} disabled={pending}>
            {pending ? "Saving…" : mode === "late" ? "Save batch" : "Start cooling"}
          </KitchenButton>
        </div>
      </div>
    </FormShell>
  )
}

function CheckpointForm({
  log,
  checkpoint,
  onClose,
}: {
  log: CoolingLogRecord
  checkpoint: "TWO_HOUR" | "SIX_HOUR"
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [tempC, setTempC] = useState("")
  const [at, setAt] = useState(nowLocalIso())
  const [fridgeTempC, setFridgeTempC] = useState("")
  const [notes, setNotes] = useState("")
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const target = checkpoint === "TWO_HOUR" ? "≤ 21 °C" : "≤ 5 °C"
  const title = checkpoint === "TWO_HOUR" ? "2-hour check" : "6-hour check"

  const submit = () => {
    setError(null)
    const n = Number(tempC)
    if (!tempC || Number.isNaN(n)) return setError("Temperature required")
    startTransition(async () => {
      try {
        await recordCoolingCheckpoint({
          id: log.id,
          checkpoint,
          tempC: n,
          at: new Date(at),
          fridgeTempC: fridgeTempC ? Number(fridgeTempC) : null,
          notes: notes || null,
        })
        onClose()
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed")
      }
    })
  }

  const remove = () => {
    startTransition(async () => {
      try {
        await deleteCoolingLog(log.id)
        onClose()
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed")
      }
    })
  }

  return (
    <FormShell title={`${title} — ${log.itemName}`} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-[10px] bg-[var(--tk-bg)] px-3 py-2 text-[13px] text-[var(--tk-ink-soft)]">
          Target {target}. Reading auto-uses now — adjust only if you took the
          temp earlier.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Temperature (°C)</FieldLabel>
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              step="0.1"
              className={inputClass}
              value={tempC}
              onChange={(e) => setTempC(e.target.value)}
            />
          </div>
          <div>
            <FieldLabel>Time taken</FieldLabel>
            <input
              type="datetime-local"
              className={inputClass}
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Fridge / cool room temp (°C)</FieldLabel>
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            className={inputClass}
            value={fridgeTempC}
            onChange={(e) => setFridgeTempC(e.target.value)}
          />
        </div>
        <div>
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-[10px] bg-[var(--tk-warn-soft)] px-3 py-2 text-[13px] text-[var(--tk-warn)]">
            {error}
          </div>
        )}

        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 pt-2">
          {confirmDelete ? (
            <button
              type="button"
              onClick={remove}
              disabled={pending}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--tk-warn)]"
            >
              <Trash2 className="h-4 w-4" />
              Tap again to confirm delete
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--tk-ink-mute)]"
            >
              <Trash2 className="h-4 w-4" />
              Delete batch
            </button>
          )}
          <div className="flex gap-3">
            <KitchenButton
              variant="secondary"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </KitchenButton>
            <KitchenButton variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save reading"}
            </KitchenButton>
          </div>
        </div>
      </div>
    </FormShell>
  )
}
