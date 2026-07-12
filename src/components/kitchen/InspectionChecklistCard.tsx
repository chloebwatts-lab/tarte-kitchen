"use client"

import { useState } from "react"

export interface InspectionChecklistItem {
  id: string
  label: string
  requireTemp: boolean
  tempCelsius: string | null
  note: string | null
  checkedBy: string | null
  /** Pre-formatted AEST time string, e.g. "9:12 am", or null if unchecked. */
  checkedTime: string | null
  checked: boolean
}

export interface InspectionChecklistCardProps {
  templateName: string
  area: string | null
  venueLabel: string | null
  shift: string
  status: string
  completedBy: string | null
  checkedItems: number
  totalItems: number
  items: InspectionChecklistItem[]
}

/**
 * One checklist run in the Inspection view. Collapsed it shows the summary line
 * (as before); tap/click to expand the full per-item detail — labels, ticks,
 * temps and notes — so an EHO can drill into e.g. stock/pastry rotation.
 */
export function InspectionChecklistCard({
  templateName,
  area,
  venueLabel,
  shift,
  status,
  completedBy,
  checkedItems,
  totalItems,
  items,
}: InspectionChecklistCardProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-[12px] border border-[var(--tk-line)] bg-white print:border-black">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-left"
      >
        <div className="font-semibold text-[var(--tk-charcoal)]">
          <span
            className="mr-1.5 inline-block text-[var(--tk-ink-mute)] transition-transform print:hidden"
            style={{ transform: open ? "rotate(90deg)" : "none" }}
          >
            ›
          </span>
          {templateName}
          {area && (
            <span className="ml-2 text-[12px] font-normal text-[var(--tk-ink-soft)]">
              {area}
            </span>
          )}
        </div>
        <div className="text-[12px] text-[var(--tk-ink-soft)]">
          {venueLabel && <span>{venueLabel} · </span>}
          {shift.toLowerCase()} shift · {checkedItems}/{totalItems} items ·{" "}
          {status.toLowerCase()}
          {completedBy && ` · by ${completedBy}`}
        </div>
      </button>

      {open && (
        <div className="border-t border-[var(--tk-line)] print:border-black">
          <table className="w-full text-[13px]">
            <thead>
              <tr
                className="text-left text-[11px] uppercase tracking-wider text-[var(--tk-ink-mute)]"
                style={{ background: "var(--tk-bg)" }}
              >
                <th className="px-4 py-2 font-semibold">Item</th>
                <th className="px-3 py-2 font-semibold tabular-nums">Temp</th>
                <th className="px-3 py-2 font-semibold">Note</th>
                <th className="px-3 py-2 font-semibold">By</th>
                <th className="px-3 py-2 font-semibold">Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  className="border-t border-[var(--tk-line)] align-top"
                >
                  <td className="px-4 py-2 font-medium text-[var(--tk-charcoal)]">
                    <span
                      className="mr-1.5"
                      style={{ color: it.checked ? "var(--tk-done)" : "var(--tk-ink-mute)" }}
                    >
                      {it.checked ? "✓" : "○"}
                    </span>
                    {it.label}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[var(--tk-ink)]">
                    {it.requireTemp && it.tempCelsius !== null
                      ? `${it.tempCelsius}°C`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                    {it.note ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                    {it.checkedBy ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                    {it.checkedTime ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
