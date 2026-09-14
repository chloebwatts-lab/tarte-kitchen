import Link from "next/link"
import { ArrowRight, Lock } from "lucide-react"
import type { ComponentType } from "react"

export interface GridTile {
  title: string
  sub: string
  href: string
  icon: ComponentType<{ className?: string; strokeWidth?: number }>
  locked?: boolean
}

/** The white-on-sage tile grid used by Staff tools and its sub pages. */
export function ToolGrid({ tiles, big = false }: { tiles: GridTile[]; big?: boolean }) {
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${big ? "" : "lg:grid-cols-3"}`}>
      {tiles.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`group flex flex-col justify-between rounded-[20px] bg-white/95 p-6 transition active:scale-[0.99] ${big ? "min-h-[170px]" : "min-h-[130px]"}`}
          style={{ color: "var(--tk-charcoal)" }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="tk-display leading-tight" style={{ fontSize: big ? 28 : 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {t.title}
              </div>
              <div className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{t.sub}</div>
            </div>
            {t.locked ? (
              <Lock className="h-7 w-7 shrink-0 text-[var(--tk-ink-soft)]" strokeWidth={1.7} />
            ) : (
              <t.icon className="h-7 w-7 shrink-0 text-[var(--tk-ink-soft)]" strokeWidth={1.7} />
            )}
          </div>
          <ArrowRight className="h-5 w-5 self-end transition group-hover:translate-x-1" />
        </Link>
      ))}
    </div>
  )
}
