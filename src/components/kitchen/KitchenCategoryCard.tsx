import Link from "next/link"
import { ArrowRight } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type CategoryTone = "sage" | "gold"

/**
 * Brand-locked rule (non-negotiable per handoff):
 *  - sage bg → white text
 *  - gold bg → charcoal text
 * Do not expose a text-color prop.
 */
export function KitchenCategoryCard({
  tone,
  title,
  subtitle,
  icon,
  stats,
  href,
}: {
  tone: CategoryTone
  title: string
  subtitle: string
  icon: ReactNode
  stats: { label: string; value: number | string }[]
  href: string
}) {
  const onSage = tone === "sage"
  const bg = onSage ? "var(--tk-sage)" : "var(--tk-gold)"
  const fg = onSage ? "#ffffff" : "var(--tk-charcoal)"
  const fgSoft = onSage ? "rgba(255,255,255,0.85)" : "rgba(60,62,63,0.72)"
  const fgMute = onSage ? "rgba(255,255,255,0.6)" : "rgba(60,62,63,0.55)"
  const iconBg = onSage ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.5)"
  const arrowBg = onSage ? "#ffffff" : "var(--tk-charcoal)"
  const arrowFg = onSage ? "var(--tk-charcoal)" : "#ffffff"

  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-[24px] p-8 transition active:scale-[0.995]"
      )}
      style={{ background: bg, color: fg }}
    >
      <div>
        <div
          className="mb-6 flex h-16 w-16 items-center justify-center rounded-[20px]"
          style={{ background: iconBg, color: fg }}
        >
          {icon}
        </div>
        <div
          className="tk-display leading-none"
          style={{
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: fg,
          }}
        >
          {title}
        </div>
        <p
          className="mt-3 max-w-sm leading-snug"
          style={{ fontSize: 17, color: fgSoft }}
        >
          {subtitle}
        </p>
      </div>

      <div className="mt-5 flex items-end justify-between">
        <div className="flex gap-7">
          {stats.map((s) => (
            <div key={s.label}>
              <div
                className="tk-display leading-none"
                style={{
                  fontSize: 30,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: fg,
                }}
              >
                {s.value}
              </div>
              <div className="tk-caps mt-1" style={{ color: fgMute }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
        <div
          className="flex h-[52px] w-[52px] items-center justify-center rounded-full"
          style={{ background: arrowBg, color: arrowFg }}
        >
          <ArrowRight className="h-[22px] w-[22px]" />
        </div>
      </div>
    </Link>
  )
}
