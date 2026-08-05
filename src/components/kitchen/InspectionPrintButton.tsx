"use client"

import { Printer } from "lucide-react"

export function InspectionPrintButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // Day sections are collapsed <details>, pop them all open so the
        // paper copy carries the full record, then print.
        document
          .querySelectorAll<HTMLDetailsElement>("details")
          .forEach((d) => (d.open = true))
        window.print()
      }}
      className="inline-flex items-center gap-2 rounded-full bg-[var(--tk-charcoal)] px-4 py-2 text-[13px] font-semibold text-white"
    >
      <Printer className="h-4 w-4" />
      Print
    </button>
  )
}
