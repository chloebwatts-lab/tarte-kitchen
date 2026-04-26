"use client"

import { useState, useTransition, useMemo } from "react"
import { ChevronLeft, ChevronRight, Flame, Trash2 } from "lucide-react"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import {
  savePastryRotationEntry,
  deletePastryRotationEntry,
  type PastryRotationDay,
  type PastryEntryRecord,
  type PastryProductRecord,
} from "@/lib/actions/pastry-rotation"
import { BAKE_ORDER, BAKE_LABEL } from "@/lib/pastry-rotation-constants"
import type { PastryBakeTime } from "@/generated/prisma"

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

function formatHeaderDate(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })
}

function entryKey(productId: string, bakeTime: PastryBakeTime) {
  return `${productId}:${bakeTime}`
}

export function PastryRotationDashboard({
  initial,
}: {
  initial: PastryRotationDay
}) {
  const [day] = useState(initial)
  const [openCell, setOpenCell] = useState<null | {
    product: PastryProductRecord
    bakeTime: PastryBakeTime
    existing: PastryEntryRecord | null
  }>(null)

  const entryMap = useMemo(() => {
    const m = new Map<string, PastryEntryRecord>()
    for (const e of day.entries) m.set(entryKey(e.productId, e.bakeTime), e)
    return m
  }, [day.entries])

  function navigateTo(newDate: string) {
    const url = new URL(window.location.href)
    url.searchParams.set("date", newDate)
    window.location.href = url.toString()
  }

  const totals = useMemo(() => {
    let prepared = 0
    let sold = 0
    let discarded = 0
    for (const e of day.entries) {
      prepared += e.prepared
      sold += e.sold
      discarded += e.discarded
    }
    return { prepared, sold, discarded }
  }, [day.entries])

  const today = (() => {
    const now = new Date()
    const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
    return aest.toISOString().split("T")[0]
  })()

  return (
    <div className="space-y-5">
      {/* Date bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--tk-line)] bg-white px-3 py-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => navigateTo(shiftDate(day.date, -1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--tk-ink-soft)] active:bg-[var(--tk-charcoal-soft)]"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-[220px] text-center">
            <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
              {formatHeaderDate(day.date)}
            </div>
            {day.date !== today && (
              <div className="text-[11px] text-[var(--tk-ink-soft)]">
                Viewing past day
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => navigateTo(shiftDate(day.date, 1))}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-[var(--tk-ink-soft)] active:bg-[var(--tk-charcoal-soft)]"
            aria-label="Next day"
            disabled={day.date >= today}
            style={{ opacity: day.date >= today ? 0.3 : 1 }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
        <div className="flex items-baseline gap-5 px-3 text-[13px]">
          <TotalChip label="Prepared" value={totals.prepared} />
          <TotalChip label="Sold" value={totals.sold} tint="sage" />
          <TotalChip label="Discarded" value={totals.discarded} tint="warn" />
        </div>
        {day.date !== today && (
          <button
            type="button"
            onClick={() => navigateTo(today)}
            className="rounded-full bg-[var(--tk-charcoal)] px-4 py-2 text-[13px] font-semibold text-white"
          >
            Back to today
          </button>
        )}
      </div>

      {/* Grid */}
      {day.products.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-12 text-center text-[14px] text-[var(--tk-ink-soft)]">
          No pastry products set up for this venue yet. Ask a manager to add
          them in the admin app.
        </div>
      ) : (
        <div className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
          <table className="w-full">
            <thead>
              <tr
                className="text-left text-[11px] uppercase tracking-wider text-[var(--tk-ink-mute)]"
                style={{ background: "var(--tk-bg)" }}
              >
                <th className="px-4 py-3 font-semibold">Product</th>
                {BAKE_ORDER.map((b) => (
                  <th
                    key={b}
                    className="px-3 py-3 text-center font-semibold"
                  >
                    <div className="inline-flex items-center gap-1.5">
                      <Flame className="h-3.5 w-3.5" />
                      {BAKE_LABEL[b]}
                    </div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-semibold">Day total</th>
              </tr>
            </thead>
            <tbody>
              {day.products.map((p) => {
                let rowPrepared = 0
                let rowSold = 0
                let rowDiscarded = 0
                for (const b of BAKE_ORDER) {
                  const e = entryMap.get(entryKey(p.id, b))
                  if (e) {
                    rowPrepared += e.prepared
                    rowSold += e.sold
                    rowDiscarded += e.discarded
                  }
                }
                return (
                  <tr
                    key={p.id}
                    className="border-t border-[var(--tk-line)]"
                  >
                    <td className="px-4 py-3 font-semibold text-[var(--tk-charcoal)]">
                      {p.name}
                    </td>
                    {BAKE_ORDER.map((b) => {
                      const e = entryMap.get(entryKey(p.id, b))
                      return (
                        <td key={b} className="px-2 py-1.5">
                          <CellButton
                            entry={e}
                            onClick={() =>
                              setOpenCell({
                                product: p,
                                bakeTime: b,
                                existing: e ?? null,
                              })
                            }
                          />
                        </td>
                      )
                    })}
                    <td className="px-3 py-3 text-right">
                      {rowPrepared + rowSold + rowDiscarded === 0 ? (
                        <span className="text-[13px] text-[var(--tk-ink-mute)]">—</span>
                      ) : (
                        <div className="inline-flex items-baseline gap-2.5 tabular-nums text-[13px]">
                          <span className="font-semibold text-[var(--tk-charcoal)]">
                            {rowPrepared}
                          </span>
                          <span style={{ color: "var(--tk-done)" }}>
                            {rowSold} sold
                          </span>
                          {rowDiscarded > 0 && (
                            <span style={{ color: "var(--tk-warn)" }}>
                              {rowDiscarded} waste
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {openCell && (
        <CellForm
          venue={day.venue}
          date={day.date}
          product={openCell.product}
          bakeTime={openCell.bakeTime}
          existing={openCell.existing}
          onClose={() => setOpenCell(null)}
        />
      )}
    </div>
  )
}

function TotalChip({
  label,
  value,
  tint,
}: {
  label: string
  value: number
  tint?: "sage" | "warn"
}) {
  const color =
    tint === "sage"
      ? "var(--tk-done)"
      : tint === "warn"
        ? "var(--tk-warn)"
        : "var(--tk-charcoal)"
  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className="tk-display tabular-nums leading-none"
        style={{ fontSize: 20, fontWeight: 700, color }}
      >
        {value}
      </span>
      <span
        className="text-[11px] uppercase tracking-wider text-[var(--tk-ink-mute)]"
        style={{ letterSpacing: "0.1em" }}
      >
        {label}
      </span>
    </div>
  )
}

function CellButton({
  entry,
  onClick,
}: {
  entry: PastryEntryRecord | undefined
  onClick: () => void
}) {
  if (!entry) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex h-[72px] w-full items-center justify-center rounded-[12px] border border-dashed border-[var(--tk-line)] text-[12px] font-semibold uppercase tracking-wider text-[var(--tk-ink-mute)] transition active:scale-[0.98] active:bg-[var(--tk-charcoal-soft)]"
      >
        Tap to log
      </button>
    )
  }
  const hasWaste = entry.discarded > 0
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[72px] w-full flex-col items-center justify-center rounded-[12px] px-2 text-[var(--tk-charcoal)] transition active:scale-[0.98]"
      style={{
        background: hasWaste ? "var(--tk-warn-soft)" : "var(--tk-sage-soft)",
      }}
    >
      <div
        className="tk-display tabular-nums leading-none"
        style={{ fontSize: 20, fontWeight: 700 }}
      >
        {entry.prepared}
      </div>
      <div className="mt-1 flex items-baseline gap-2 text-[11px] tabular-nums">
        <span style={{ color: "var(--tk-done)" }}>
          {entry.sold} sold
        </span>
        {entry.discarded > 0 && (
          <span style={{ color: "var(--tk-warn)" }}>
            {entry.discarded} waste
          </span>
        )}
      </div>
    </button>
  )
}

function CellForm({
  venue,
  date,
  product,
  bakeTime,
  existing,
  onClose,
}: {
  venue: PastryRotationDay["venue"]
  date: string
  product: PastryProductRecord
  bakeTime: PastryBakeTime
  existing: PastryEntryRecord | null
  onClose: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [prepared, setPrepared] = useState(existing?.prepared.toString() ?? "")
  const [sold, setSold] = useState(existing?.sold.toString() ?? "")
  const [discarded, setDiscarded] = useState(existing?.discarded.toString() ?? "")
  const [staffName, setStaffName] = useState(existing?.staffName ?? "")
  const [notes, setNotes] = useState(existing?.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const submit = () => {
    setError(null)
    const p = Number(prepared || 0)
    const s = Number(sold || 0)
    const d = Number(discarded || 0)
    if ([p, s, d].some((n) => Number.isNaN(n) || n < 0)) {
      return setError("Counts must be zero or more.")
    }
    if (!staffName.trim()) {
      return setError("Name required")
    }
    startTransition(async () => {
      try {
        await savePastryRotationEntry({
          venue,
          date,
          bakeTime,
          productId: product.id,
          prepared: p,
          sold: s,
          discarded: d,
          staffName,
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
        await deletePastryRotationEntry({
          venue,
          date,
          bakeTime,
          productId: product.id,
        })
        onClose()
        window.location.reload()
      } catch (e) {
        setError(e instanceof Error ? e.message : "Delete failed")
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-t-[24px] bg-white p-6 sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="tk-display mb-1 leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          {product.name}
        </div>
        <div className="mb-4 text-[13px] text-[var(--tk-ink-soft)]">
          {BAKE_LABEL[bakeTime]} · {date}
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          <NumberField label="Prepared" value={prepared} onChange={setPrepared} />
          <NumberField label="Sold" value={sold} onChange={setSold} />
          <NumberField
            label="Discarded"
            value={discarded}
            onChange={setDiscarded}
            warn
          />
        </div>

        <div className="mt-3">
          <FieldLabel>Name</FieldLabel>
          <input
            className={inputClass}
            placeholder="First name"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
          />
        </div>

        <div className="mt-3">
          <FieldLabel>Notes (optional)</FieldLabel>
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <div className="mt-3 rounded-[10px] bg-[var(--tk-warn-soft)] px-3 py-2 text-[13px] text-[var(--tk-warn)]">
            {error}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          {existing ? (
            confirmDelete ? (
              <button
                type="button"
                onClick={remove}
                disabled={pending}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--tk-warn)]"
              >
                <Trash2 className="h-4 w-4" />
                Tap again to confirm
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--tk-ink-mute)]"
              >
                <Trash2 className="h-4 w-4" />
                Clear entry
              </button>
            )
          ) : (
            <div />
          )}
          <div className="flex gap-3">
            <KitchenButton variant="secondary" onClick={onClose} disabled={pending}>
              Cancel
            </KitchenButton>
            <KitchenButton variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </KitchenButton>
          </div>
        </div>
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

function NumberField({
  label,
  value,
  onChange,
  warn,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  warn?: boolean
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        className={
          inputClass +
          (warn
            ? " text-[var(--tk-warn)]"
            : "")
        }
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
      />
    </div>
  )
}
