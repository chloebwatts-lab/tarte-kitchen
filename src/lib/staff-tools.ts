import type { ComponentType } from "react"
import {
  CalendarCheck, ClipboardCheck, ClipboardList, Croissant, Eye, Lock,
  MessageSquarePlus, PackageOpen, PackageSearch, Printer, Scale, ShieldCheck,
  ShoppingBasket, ShoppingCart, Snowflake, Trash2, Wrench, Megaphone, Sunrise,
  Handshake, GraduationCap, ListChecks, Compass,
} from "lucide-react"

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>

export interface Tool { title: string; sub: string; href: string; icon: Icon }
export interface ToolGroup {
  slug: string
  title: string
  sub: string
  icon: Icon
  tools: Tool[]
  /** Managers and Oliver: live under their own gate, not a sub page here. */
  href?: string
  locked?: boolean
}

/**
 * Staff tools, two levels. Main tiles are the four things a person walks up
 * to the iPad wanting to do; sub tiles are the actual tools. Anything with
 * numbers or names sits under Managers, behind a second password.
 */
export const TOOL_GROUPS: ToolGroup[] = [
  {
    slug: "checklists",
    title: "Checklists & logs",
    sub: "Cleaning, food safety, cooling, wastage",
    icon: ClipboardCheck,
    tools: [
      { title: "Checklists", sub: "Cleaning & food safety, per venue", href: "/kitchen", icon: ClipboardCheck },
      { title: "Cooling log", sub: "HACCP record for cooked items", href: "/kitchen/cooling", icon: Snowflake },
      { title: "Wastage log", sub: "Log anything binned, as it happens", href: "/log", icon: Trash2 },
      { title: "Pastry rotation", sub: "Prepared / sold / discarded per bake", href: "/kitchen/pastry", icon: Croissant },
      { title: "Inspection view", sub: "Council-ready last 30 days", href: "/kitchen/inspection", icon: ShieldCheck },
    ],
  },
  {
    slug: "stock",
    title: "Stock & ordering",
    sub: "Counts, the stock walk, orders",
    icon: PackageOpen,
    tools: [
      { title: "Restock & prep counts", sub: "Evening counts, morning restock run", href: "/kitchen/restock", icon: PackageOpen },
      { title: "Stock walk", sub: "Tap Low or Out, it goes on the order list", href: "/kitchen/stock", icon: PackageSearch },
      { title: "Prep walk-through", sub: "Tomorrow's prep, one tap at a time", href: "/kitchen/prep", icon: ClipboardList },
      { title: "Ordering", sub: "Your section's order, into one daily order", href: "/kitchen/order", icon: ShoppingCart },
      { title: "Ordering & supplies", sub: "Where we buy what, who to call", href: "/kitchen/ordering", icon: ShoppingBasket },
      { title: "Coolroom serves", sub: "Tub weight to full serves", href: "/kitchen/serves", icon: Scale },
    ],
  },
  {
    slug: "spotted",
    title: "Broken or spotted",
    sub: "Report it in ten seconds",
    icon: Eye,
    tools: [
      { title: "Spotted something?", sub: "Low stock, rubbish, a clean, a broken chair", href: "/kitchen/report", icon: Eye },
      { title: "Something broken?", sub: "Quick fixes, who to call, warranty", href: "/kitchen/fix", icon: Wrench },
      { title: "Printer down?", sub: "Epson docket printers: fix it in 5 stages", href: "/kitchen/printers", icon: Printer },
      { title: "Service calendar", sub: "Grease trap, pest, fire checks: done & due", href: "/kitchen/services", icon: CalendarCheck },
      { title: "Raise something", sub: "For the management meeting. Straight on the agenda", href: "/kitchen/raise", icon: MessageSquarePlus },
    ],
  },
  {
    slug: "managers",
    title: "Managers",
    sub: "Line-up, morning board, jobs board. Password.",
    icon: Lock,
    href: "/kitchen/managers",
    locked: true,
    tools: [
      { title: "Line-up", sub: "Five minutes before open, already filled in", href: "/kitchen/lineup", icon: Megaphone },
      { title: "Morning board", sub: "Everything reported, scheduled or below par", href: "/kitchen/managers/board", icon: Sunrise },
      { title: "Jobs board", sub: "What the morning board put on you. Tick it off", href: "/kitchen/jobs", icon: ListChecks },
      { title: "Said + Done", sub: "Kitchen commitments, week by week", href: "/kitchen/commitments", icon: Handshake },
      { title: "Meeting agenda", sub: "What people have raised, and what was decided", href: "/kitchen/managers/agenda", icon: MessageSquarePlus },
      { title: "Staff training", sub: "Food handler records", href: "/kitchen/training", icon: GraduationCap },
      { title: "Stock list", sub: "Set up what the stock walk asks about", href: "/kitchen/managers/stock-setup", icon: PackageSearch },
    ],
  },
  {
    slug: "gm",
    title: "Oliver",
    sub: "GM desk: today, this week, the numbers. Own password.",
    icon: Compass,
    href: "/kitchen/gm",
    locked: true,
    tools: [],
  },
]

export function groupBySlug(slug: string): ToolGroup | undefined {
  return TOOL_GROUPS.find((g) => g.slug === slug)
}
