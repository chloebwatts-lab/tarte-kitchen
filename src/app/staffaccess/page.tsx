export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  ArrowRight,
  ClipboardCheck,
  ClipboardList,
  Croissant,
  GraduationCap,
  Handshake,
  PackageOpen,
  Scale,
  ShieldCheck,
  ShoppingBasket,
  Snowflake,
  Trash2,
  Wrench,
} from "lucide-react"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"

const TOOLS: Array<{
  title: string
  sub: string
  href: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
}> = [
  { title: "Checklists", sub: "Cleaning & food safety, per venue", href: "/kitchen", icon: ClipboardCheck },
  { title: "Something broken?", sub: "Quick fixes, who to call, warranty", href: "/kitchen/fix", icon: Wrench },
  { title: "Wastage log", sub: "Log anything binned, as it happens", href: "/log", icon: Trash2 },
  { title: "Restock & prep counts", sub: "Evening counts, morning restock run", href: "/kitchen/restock", icon: PackageOpen },
  { title: "Prep walk-through", sub: "Tomorrow's prep, one tap at a time", href: "/kitchen/prep", icon: ClipboardList },
  { title: "Pastry rotation", sub: "Prepared / sold / discarded per bake", href: "/kitchen/pastry", icon: Croissant },
  { title: "Cooling log", sub: "HACCP record for cooked items", href: "/kitchen/cooling", icon: Snowflake },
  { title: "Coolroom serves", sub: "Tub weight to full serves", href: "/kitchen/serves", icon: Scale },
  { title: "Ordering & supplies", sub: "Where we buy what, who to call", href: "/kitchen/ordering", icon: ShoppingBasket },
  { title: "Staff training", sub: "Food handler records", href: "/kitchen/training", icon: GraduationCap },
  { title: "Said + Done", sub: "Kitchen commitments, week by week", href: "/kitchen/commitments", icon: Handshake },
  { title: "Inspection view", sub: "Council-ready last 30 days", href: "/kitchen/inspection", icon: ShieldCheck },
]

export default function StaffAccessPage() {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ background: "var(--tk-sage)" }}
    >
      <div className="flex items-center justify-between px-8 pt-8 md:px-12">
        <KitchenLogo onDark />
      </div>

      <div className="px-8 pt-10 pb-6 text-center md:px-12 md:pt-14">
        <h1
          className="tk-display mx-auto leading-none text-white"
          style={{ fontSize: "clamp(48px, 8vw, 80px)", fontWeight: 600, letterSpacing: "-0.035em" }}
        >
          Staff tools
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[19px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
          Everything in one place — no login needed. Bookmark this page.
        </p>
      </div>

      <div className="mx-auto max-w-[1100px] px-6 pb-12 md:px-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="group flex min-h-[130px] flex-col justify-between rounded-[20px] bg-white/95 p-6 transition active:scale-[0.99]"
              style={{ color: "var(--tk-charcoal)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="tk-display leading-tight" style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}>
                    {t.title}
                  </div>
                  <div className="mt-1 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{t.sub}</div>
                </div>
                <t.icon className="h-7 w-7 shrink-0 text-[var(--tk-ink-soft)]" strokeWidth={1.7} />
              </div>
              <ArrowRight className="h-5 w-5 self-end transition group-hover:translate-x-1" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
