import Link from "next/link"
import { ChevronRight, LayoutGrid } from "lucide-react"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"

export type Crumb = {
  label: string
  /** Omit href on the last (current) crumb. */
  href?: string
}

/**
 * Breadcrumb header for the iPad kitchen flow. Each segment is a real link
 * back to that level, staff don't have to tap "back" several times to get
 * out of a deep route. The last crumb is rendered as the current page label
 * (no link).
 *
 * On phones only the parent link + current page show (everything else is
 * one tap away via the parent), so the header is always a single row
 * instead of a stack of wrapped crumbs.
 *
 * All inner links use `replace` so the browser history stays shallow and the
 * native back button doesn't dredge up stale intermediate pages.
 */
export function KitchenBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-[var(--tk-line)] pb-3 md:gap-4 md:pb-4">
      <nav
        className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-0.5 text-[13px] md:text-[14px]"
        aria-label="Breadcrumb"
      >
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          const isParent = i === crumbs.length - 2
          // Phones: parent + current only. iPad and up: the full trail.
          const visibility = isLast || isParent ? "inline-flex" : "hidden md:inline-flex"
          return (
            <span key={i} className={`${visibility} min-w-0 items-center gap-0.5`}>
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  replace
                  className="max-w-[10rem] truncate whitespace-nowrap rounded-full px-2 py-1.5 font-semibold text-[var(--tk-ink-soft)] transition active:bg-[var(--tk-charcoal-soft)] hover:text-[var(--tk-charcoal)] md:px-2.5"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="min-w-0 truncate whitespace-nowrap px-2 py-1.5 font-semibold text-[var(--tk-charcoal)] md:px-2.5">
                  {c.label}
                </span>
              )}
              {!isLast && (
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--tk-ink-mute)]" />
              )}
            </span>
          )
        })}
      </nav>
      <div className="flex shrink-0 items-center gap-3">
        {/* One obvious tap back to the all-tools hub, on every staff page. */}
        <Link
          href="/staffaccess"
          aria-label="Staff tools"
          className="flex items-center gap-2 rounded-full bg-[var(--tk-charcoal)] p-2.5 text-[13px] font-bold text-white transition active:scale-95 sm:px-4 sm:py-2"
        >
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">Staff tools</span>
        </Link>
        <div className="hidden md:block">
          <KitchenLogo size={0.85} />
        </div>
      </div>
    </div>
  )
}
