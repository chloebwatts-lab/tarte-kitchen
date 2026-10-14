"use client"

import { LayoutList } from "lucide-react"

export const WHOLE_LIST = "ALL"

/**
 * Section buttons at the top of a sectioned prep list (Chloe, 14 Oct 2026):
 * one per section plus "Whole list", so a chef on the Café side can jump to
 * the Café part of the count sheet and of the morning Make prep list
 * without scrolling past everyone else's. Picking a section filters the
 * list to it; Whole list shows everything.
 */
export function SectionNav({
  sections,
  current,
  counts,
  onPick,
}: {
  sections: readonly string[]
  /** A section name, or WHOLE_LIST. */
  current: string
  /** Items per section, for the small number on each button. */
  counts?: Record<string, number>
  onPick: (section: string) => void
}) {
  if (sections.length === 0) return null
  const total = counts ? Object.values(counts).reduce((s, n) => s + n, 0) : null
  const chip = (on: boolean) =>
    `flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition active:scale-[0.98] ${
      on ? "bg-[var(--tk-charcoal)] text-white" : "border border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)]"
    }`
  return (
    <nav aria-label="Sections" className="sticky top-0 z-10 -mx-1 bg-[var(--tk-bg)] px-1 py-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => onPick(WHOLE_LIST)} aria-pressed={current === WHOLE_LIST} className={chip(current === WHOLE_LIST)}>
          <LayoutList className="h-4 w-4" />
          Whole list
          {total != null && <span className="tabular-nums opacity-70">({total})</span>}
        </button>
        {sections.map((s) => (
          <button key={s} type="button" onClick={() => onPick(s)} aria-pressed={current === s} className={chip(current === s)}>
            {s}
            {counts && <span className="tabular-nums opacity-70">({counts[s] ?? 0})</span>}
          </button>
        ))}
      </div>
    </nav>
  )
}
