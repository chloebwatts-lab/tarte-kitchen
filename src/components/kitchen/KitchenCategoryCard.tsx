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
        "relative flex min-h-[190px] flex-col justify-between overflow-hidden rounded-[20px] p-5 transition active:scale-[0.995] md:min-h-[320px] md:rounded-[24px] md:p-8"
      )}
      style={{ background: bg, color: fg }}
    >
      <div>
        <div
          className="mb-4 flex h-11 w-11 items-center justify-center rounded-[14px] md:mb-6 md:h-16 md:w-16 md:rounded-[20px]"
          style={{ background: iconBg, color: fg }}
        >
          {icon}
        </div>
        <div
          className="tk-display text-[26px] leading-none md:text-[40px]"
          style={{
            fontWeight: 700,
            letterSpacing: "-0.03em",
            color: fg,
          }}
        >
          {title}
        </div>
        <p
          className="mt-2 max-w-sm text-[14px] leading-snug md:mt-3 md:text-[17px]"
          style={{ color: fgSoft }}
        >
          {subtitle}
        </p>
      </div>

      <div className="mt-4 flex items-end justify-between md:mt-5">
        <div className="flex gap-5 md:gap-7">
          {stats.map((s) => (
            <div key={s.label}>
              <div
                className="tk-display text-[22px] leading-none md:text-[30px]"
                style={{
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
          className="flex h-11 w-11 items-center justify-center rounded-full md:h-[52px] md:w-[52px]"
          style={{ background: arrowBg, color: arrowFg }}
        >
          <ArrowRight className="h-[20px] w-[20px] md:h-[22px] md:w-[22px]" />
        </div>
      </div>
    </Link>
  )
}
