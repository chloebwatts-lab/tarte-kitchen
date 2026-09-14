"use client"

import { usePathname, useRouter } from "next/navigation"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
const VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

/**
 * Always-visible venue switch for venue-scoped kitchen pages. The remembered
 * tk-venue cookie is a convenience, not a trap: a page should never land on
 * a venue with no way to change it. Switching updates the cookie too, so the
 * next visit from Staff tools opens on the venue you actually chose.
 */
/** Module-level, like the picker's rememberVenue: the compiler lint rejects
 * mutating a global from inside a component-scoped function. */
function rememberVenue(v: Venue) {
  document.cookie = `tk-venue=${v}; path=/; max-age=31536000; samesite=lax`
}

export function VenueSwitch({ current }: { current: Venue }) {
  const router = useRouter()
  const pathname = usePathname()
  function pick(v: Venue) {
    rememberVenue(v)
    router.push(`${pathname}?venue=${v}`)
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {VENUES.map((v) => (
        <button
          key={v}
          onClick={() => pick(v)}
          aria-pressed={v === current}
          className={`rounded-[10px] px-3 py-1.5 text-[14px] font-semibold transition active:scale-[0.98] ${
            v === current
              ? "bg-[var(--tk-charcoal)] text-white"
              : "border border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-ink-soft)]"
          }`}
        >
          {VENUE_LABEL[v].replace(/\s*\(.*\)$/, "")}
        </button>
      ))}
    </div>
  )
}
