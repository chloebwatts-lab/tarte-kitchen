"use client"

import { useState } from "react"
import type { VenueTaskPriority } from "@/generated/prisma/client"
import { chip } from "@/components/kitchen/board-format"

export * from "@/components/kitchen/board-format"

/**
 * The shared pieces of the board rows: priority tag, meta line, section
 * heading and the name chips. Client-side because NamePicker holds state.
 */

export function PriorityTag({ priority }: { priority: VenueTaskPriority }) {
  if (priority === "URGENT") {
    return (
      <span className="rounded-full bg-[var(--tk-warn-soft)] px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--tk-warn)]">
        Today
      </span>
    )
  }
  if (priority === "WHENEVER") {
    return (
      <span className="rounded-full bg-[var(--tk-charcoal-soft)] px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--tk-ink-soft)]">
        Whenever
      </span>
    )
  }
  return null
}

/** The dot-separated line under a job title. */
export function MetaLine({ items }: { items: React.ReactNode[] }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-[14px] text-[var(--tk-ink-soft)]">
      {items.map((m, i) => (
        <span key={i} className="flex items-center gap-x-1.5">
          {i > 0 ? <span className="text-[var(--tk-ink-mute)]">·</span> : null}
          {m}
        </span>
      ))}
    </p>
  )
}

export function SectionHead({
  title,
  count,
  hint,
}: {
  title: string
  count?: number
  hint?: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <h2 className="tk-display text-[24px] font-bold tracking-[-0.02em] text-[var(--tk-charcoal)]">
        {title}
      </h2>
      {count !== undefined ? (
        <span className="tk-display text-[16px] font-bold text-[var(--tk-ink-mute)]">{count}</span>
      ) : null}
      {hint ? <span className="text-[15px] text-[var(--tk-ink-soft)]">{hint}</span> : null}
    </div>
  )
}

export function NamePicker({
  names,
  current,
  onPick,
  busy,
  compact,
}: {
  names: string[]
  current: string | null
  onPick: (name: string) => void
  busy: boolean
  compact?: boolean
}) {
  const [other, setOther] = useState(false)
  const [typed, setTyped] = useState("")
  const shown = compact ? names.slice(0, 4) : names
  const cur = (current ?? "").trim().toLowerCase()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {shown.map((n) => (
        <button
          key={n}
          disabled={busy}
          onClick={() => onPick(n)}
          className={chip(n.trim().toLowerCase() === cur)}
        >
          {n}
        </button>
      ))}
      {other ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (typed.trim()) onPick(typed)
          }}
        >
          <input
            autoFocus
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Name"
            className="w-36 rounded-[10px] border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] px-3 py-2 text-[15px]"
          />
          <button type="submit" disabled={busy || !typed.trim()} className={chip(true)}>
            Set
          </button>
        </form>
      ) : (
        <button
          disabled={busy}
          onClick={() => setOther(true)}
          className="rounded-[10px] px-2 py-2 text-[15px] font-semibold text-[var(--tk-ink-soft)] underline decoration-[var(--tk-line)] underline-offset-4"
        >
          {names.length ? "Someone else" : "Type a name"}
        </button>
      )}
    </div>
  )
}
