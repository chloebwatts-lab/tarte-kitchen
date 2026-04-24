import type { ReactNode } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function KitchenCard({
  children,
  className,
  href,
  selected = false,
}: {
  children: ReactNode
  className?: string
  href?: string
  selected?: boolean
}) {
  const cls = cn(
    "block rounded-[20px] p-7 transition active:scale-[0.995]",
    selected
      ? "bg-[var(--tk-charcoal)] text-white border-[1.5px] border-[var(--tk-charcoal)]"
      : "bg-[var(--tk-card)] text-[var(--tk-charcoal)] border-[1.5px] border-[var(--tk-line)]",
    className
  )
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    )
  }
  return <div className={cls}>{children}</div>
}
