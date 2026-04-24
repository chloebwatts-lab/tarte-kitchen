import Link from "next/link"
import type { ReactNode, ComponentProps } from "react"
import { cn } from "@/lib/utils"

type Variant = "primary" | "secondary" | "ghost" | "onSage"

const base =
  "inline-flex items-center justify-center gap-3 rounded-[14px] font-semibold transition active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none"

const variants: Record<Variant, string> = {
  primary: "bg-[var(--tk-charcoal)] text-white",
  secondary:
    "bg-[var(--tk-card)] text-[var(--tk-ink)] border border-[var(--tk-line)]",
  ghost: "text-[var(--tk-ink-soft)]",
  onSage: "bg-white text-[var(--tk-charcoal)]",
}

const sizes = {
  sm: "px-3.5 py-2 text-[14px]",
  md: "px-5 py-3 text-[15px]",
  lg: "px-6 py-4 text-[18px]",
  xl: "px-9 py-[22px] text-[20px] min-w-[280px] rounded-[18px]",
}

type Props = {
  variant?: Variant
  size?: keyof typeof sizes
  children: ReactNode
  className?: string
} & (
  | ({ href: string } & Omit<ComponentProps<typeof Link>, "href">)
  | ({ href?: undefined } & ComponentProps<"button">)
)

export function KitchenButton({
  variant = "primary",
  size = "md",
  children,
  className,
  ...rest
}: Props) {
  const cls = cn(base, variants[variant], sizes[size], className)
  if ("href" in rest && rest.href) {
    const { href, ...linkProps } = rest
    return (
      <Link href={href} className={cls} {...linkProps}>
        {children}
      </Link>
    )
  }
  const btnProps = rest as ComponentProps<"button">
  return (
    <button className={cls} {...btnProps}>
      {children}
    </button>
  )
}
