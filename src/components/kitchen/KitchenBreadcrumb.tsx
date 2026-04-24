import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"

export type Crumb = {
  label: string
  /** Omit href on the last (current) crumb. */
  href?: string
}

/**
 * Breadcrumb header for the iPad kitchen flow. Each segment is a real link
 * back to that level — staff don't have to tap "back" several times to get
 * out of a deep route. The last crumb is rendered as the current page label
 * (no link).
 *
 * All inner links use `replace` so the browser history stays shallow and the
 * native back button doesn't dredge up stale intermediate pages.
 */
export function KitchenBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--tk-line)] pb-4">
      <nav
        className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1 text-[14px]"
        aria-label="Breadcrumb"
      >
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1
          return (
            <span key={i} className="inline-flex items-center gap-1">
              {c.href && !isLast ? (
                <Link
                  href={c.href}
                  replace
                  className="rounded-full px-2.5 py-1.5 font-semibold text-[var(--tk-ink-soft)] transition active:bg-[var(--tk-charcoal-soft)] hover:text-[var(--tk-charcoal)]"
                >
                  {c.label}
                </Link>
              ) : (
                <span className="px-2.5 py-1.5 font-semibold text-[var(--tk-charcoal)]">
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
      <div className="hidden md:block">
        <KitchenLogo size={0.85} />
      </div>
    </div>
  )
}
