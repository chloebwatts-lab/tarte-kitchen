"use client"

import { Thermometer } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { KitchenTick } from "./KitchenTick"

export function KitchenChecklistRow({
  label,
  instructions,
  requireTemp,
  requireNote,
  tempCelsius,
  note,
  checkedAt,
  checkedBy,
  onToggle,
  onTempChange,
  onNoteChange,
}: {
  label: string
  instructions: string | null
  requireTemp: boolean
  requireNote: boolean
  tempCelsius: number | null
  note: string | null
  checkedAt: string | null
  checkedBy: string | null
  onToggle: () => void
  onTempChange: (v: number | null) => void
  onNoteChange: (v: string | null) => void
}) {
  const done = !!checkedAt

  return (
    <div
      className={cn(
        "rounded-[16px] border px-5 py-4 transition-colors",
        done
          ? "bg-[var(--tk-card)] border-[var(--tk-line)]"
          : "bg-[var(--tk-card)] border-[var(--tk-line)]"
      )}
      style={done ? { opacity: 0.78 } : undefined}
    >
      <div className="flex items-start gap-4">
        <KitchenTick done={done} onClick={onToggle} />
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]",
              done && "line-through decoration-[rgba(60,62,63,0.35)] decoration-[1.5px]"
            )}
            style={{ letterSpacing: "-0.01em" }}
          >
            {label}
          </div>
          {instructions && (
            <div className="mt-1 text-[14px] leading-snug text-[var(--tk-ink-soft)]">
              {instructions}
            </div>
          )}

          {done && (checkedBy || checkedAt) && (
            <div className="mt-2 flex items-center gap-2 text-[13px] text-[var(--tk-ink-soft)]">
              {checkedBy && (
                <span className="font-semibold text-[var(--tk-charcoal)]">
                  {checkedBy}
                </span>
              )}
              {checkedBy && checkedAt && <span>·</span>}
              {checkedAt && (
                <span>
                  {new Date(checkedAt).toLocaleTimeString("en-AU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          )}

          {(requireTemp || requireNote) && (
            <div className="mt-3 space-y-2">
              {requireTemp && (
                <label className="flex items-center gap-2">
                  <Thermometer className="h-5 w-5 text-[var(--tk-done)]" />
                  <span className="text-[13px] text-[var(--tk-ink-soft)]">
                    Temp °C
                  </span>
                  <input
                    inputMode="decimal"
                    value={tempCelsius ?? ""}
                    onChange={(e) =>
                      onTempChange(
                        e.target.value === ""
                          ? null
                          : parseFloat(e.target.value)
                      )
                    }
                    className="w-24 rounded-[10px] border border-[var(--tk-line)] bg-white px-3 py-2 text-[17px] font-semibold tabular-nums focus:border-[var(--tk-charcoal)] focus:outline-none"
                  />
                </label>
              )}
              {requireNote && (
                <input
                  value={note ?? ""}
                  onChange={(e) => onNoteChange(e.target.value || null)}
                  placeholder="Note…"
                  className="w-full rounded-[10px] border border-[var(--tk-line)] bg-white px-3 py-2 text-[15px] focus:border-[var(--tk-charcoal)] focus:outline-none"
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function KitchenChecklistRowStack({ children }: { children: ReactNode }) {
  return <div className="space-y-2.5">{children}</div>
}
