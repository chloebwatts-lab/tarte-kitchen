"use client"

import { useOptimistic, useTransition } from "react"
import { Check, Minus, Plus, X } from "lucide-react"
import { setHighTeaCheck } from "@/lib/actions/high-tea"

/**
 * The day-before call on one booking. Three big answers (everyone, some,
 * nobody) because it is filled in while on the phone to the guest.
 */
export function HighTeaCheck({
  bookingRef,
  pax,
  highTeaPax,
  checked,
}: {
  bookingRef: string
  pax: number
  highTeaPax: number
  checked: boolean
}) {
  const [pending, start] = useTransition()
  const [state, setState] = useOptimistic({ highTeaPax, checked })
  const set = (n: number | null) =>
    start(async () => {
      setState(n === null ? { highTeaPax: pax, checked: false } : { highTeaPax: n, checked: true })
      await setHighTeaCheck(bookingRef, n)
    })

  const full = state.checked && state.highTeaPax === pax
  const none = state.checked && state.highTeaPax === 0
  const some = state.checked && !full && !none
  const base = "flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-[14px] font-semibold transition active:scale-[0.98]"
  const idle = "border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)]"

  return (
    <div className={`flex flex-wrap items-center gap-2 ${pending ? "opacity-70" : ""}`}>
      <button
        type="button"
        onClick={() => set(full ? null : pax)}
        className={`${base} ${full ? "border-transparent text-white" : idle}`}
        style={full ? { background: "var(--tk-done)" } : undefined}
      >
        <Check className="h-4 w-4" /> Full high tea
      </button>
      <button
        type="button"
        onClick={() => set(none ? null : 0)}
        className={`${base} ${none ? "border-transparent text-white" : idle}`}
        style={none ? { background: "var(--tk-charcoal)" } : undefined}
      >
        <X className="h-4 w-4" /> Not having it
      </button>
      {pax > 1 && (
        <div
          className={`flex min-h-[44px] items-center gap-1 rounded-full border px-1.5 ${some ? "border-transparent" : "border-[var(--tk-line)] bg-white"}`}
          style={some ? { background: "var(--tk-gold-soft)" } : undefined}
        >
          <button
            type="button"
            aria-label="One fewer guest having high tea"
            onClick={() => set(Math.max(0, state.highTeaPax - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--tk-ink-soft)] active:bg-[var(--tk-bg)]"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="min-w-[64px] text-center text-[14px] font-semibold tabular-nums text-[var(--tk-charcoal)]">
            {state.highTeaPax} of {pax}
          </span>
          <button
            type="button"
            aria-label="One more guest having high tea"
            onClick={() => set(Math.min(pax, state.highTeaPax + 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--tk-ink-soft)] active:bg-[var(--tk-bg)]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  )
}
