"use client"

import { Thermometer } from "lucide-react"
import { useState } from "react"
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

  // Raw text keeps what the chef actually typed ("3.", "-", "-1.5") so the
  // decimal point and minus sign survive re-renders; only valid numbers are
  // pushed up to the parent / server.
  const [tempRaw, setTempRaw] = useState<string>(
    tempCelsius !== null ? String(tempCelsius) : ""
  )

  function pushTemp(raw: string) {
    if (raw.trim() === "") {
      onTempChange(null)
      return
    }
    const n = Number(raw)
    if (Number.isFinite(n)) onTempChange(n)
  }

  function handleTempInput(raw: string) {
    // Digits, one leading minus, one decimal point.
    let cleaned = raw.replace(/[^0-9.\-]/g, "")
    const neg = cleaned.startsWith("-")
    cleaned = cleaned.replace(/-/g, "")
    const firstDot = cleaned.indexOf(".")
    if (firstDot !== -1) {
      cleaned =
        cleaned.slice(0, firstDot + 1) +
        cleaned.slice(firstDot + 1).replace(/\./g, "")
    }
    if (neg) cleaned = `-${cleaned}`
    setTempRaw(cleaned)
    pushTemp(cleaned)
  }

  function handleTempBlur() {
    const n = Number(tempRaw)
    if (tempRaw.trim() === "" || !Number.isFinite(n)) {
      setTempRaw("")
      onTempChange(null)
    } else {
      setTempRaw(String(n))
      onTempChange(n)
    }
  }

  // iOS decimal keypads have no minus key, so freezer readings (-18) need an
  // explicit sign toggle.
  function toggleTempSign() {
    const next = tempRaw.startsWith("-") ? tempRaw.slice(1) : `-${tempRaw}`
    setTempRaw(next)
    pushTemp(next)
  }

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
                    value={tempRaw}
                    onChange={(e) => handleTempInput(e.target.value)}
                    onBlur={handleTempBlur}
                    className="w-24 rounded-[10px] border border-[var(--tk-line)] bg-white px-3 py-2 text-[17px] font-semibold tabular-nums focus:border-[var(--tk-charcoal)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={toggleTempSign}
                    aria-label="Toggle minus sign for sub-zero temps"
                    className={cn(
                      "h-10 w-10 shrink-0 rounded-[10px] border text-[15px] font-semibold tabular-nums transition active:scale-[0.96]",
                      tempRaw.startsWith("-")
                        ? "border-[var(--tk-charcoal)] bg-[var(--tk-charcoal)] text-white"
                        : "border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)]"
                    )}
                  >
                    +/-
                  </button>
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
