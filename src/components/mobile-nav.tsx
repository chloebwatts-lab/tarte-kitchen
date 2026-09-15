"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { LayoutGrid, LayoutDashboard, TrendingUp, Activity, Menu } from "lucide-react"
import { cn } from "@/lib/utils"

const TABS = [
  { label: "Home", href: "/home", icon: LayoutGrid },
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Prices", href: "/pricing", icon: TrendingUp },
  { label: "Spend", href: "/spend", icon: Activity },
] as const

/**
 * Phone-only bottom bar for the office app. Home is always one tap away,
 * the three pages reached for most sit beside it, and Menu opens the full
 * sidebar. Hidden from md up where the sidebar is visible anyway.
 */
export function MobileNav({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Quick navigation"
    >
      <div className="grid h-14 grid-cols-5">
        {TABS.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/")
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <t.icon className={cn("h-5 w-5", active && "stroke-[2.2]")} />
              {t.label}
            </Link>
          )
        })}
        <button
          type="button"
          onClick={onMenu}
          className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          Menu
        </button>
      </div>
    </nav>
  )
}
