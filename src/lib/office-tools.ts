import type { ComponentType } from "react"
import {
  Activity, BarChart3, Boxes, CalendarCheck, Carrot, ChefHat, ClipboardCheck,
  ClipboardList, Gauge, Handshake, LayoutDashboard, LayoutGrid, LineChart, Mail,
  Megaphone, PackageOpen, Receipt, Settings, ShieldCheck, ShoppingCart, Star,
  Sunrise, Trash2, TrendingUp, Truck, Users, UtensilsCrossed, Wrench,
} from "lucide-react"

type Icon = ComponentType<{ className?: string; strokeWidth?: number }>

export interface OfficeTool {
  title: string
  sub: string
  href: string
  icon: Icon
  /** Key into the live counts fetched by the home page. */
  badge?: "priceMoves" | "packQuestions" | "unassignedInvoices" | "overdueChecklists"
}

export interface OfficeGroup {
  title: string
  tools: OfficeTool[]
}

/**
 * The office app home, as tiles. Same groups as the sidebar, ordered by
 * how often the owner reaches for each on a phone: money first, then
 * what needs a decision today, then set-up.
 */
export const OFFICE_GROUPS: OfficeGroup[] = [
  {
    title: "Today",
    tools: [
      { title: "Dashboard", sub: "Sales, waste, alerts, this week's digest", href: "/dashboard", icon: LayoutDashboard },
      { title: "Live spend", sub: "What's left to spend this week, per venue", href: "/spend", icon: Activity, badge: "unassignedInvoices" },
      { title: "Labour live", sub: "Projected wage % against the bands, mid-week", href: "/labour/live", icon: Activity },
      { title: "Price alerts", sub: "Supplier moves and pack questions", href: "/pricing", icon: TrendingUp, badge: "priceMoves" },
      { title: "Morning board", sub: "Reported, scheduled, below par", href: "/venue-ops", icon: Sunrise },
    ],
  },
  {
    title: "Money",
    tools: [
      { title: "COGS", sub: "Weekly cost of goods vs target", href: "/cogs", icon: Receipt },
      { title: "Labour", sub: "Wage % by venue and department", href: "/labour", icon: Users },
      { title: "Menu matrix", sub: "Stars, plowhorses, recommended prices", href: "/menu-engineering", icon: LayoutGrid },
      { title: "Analysis", sub: "Revenue trends and menu mix", href: "/analysis", icon: LineChart },
      { title: "Wastage", sub: "Register and analytics, shrinkage", href: "/wastage", icon: Trash2 },
      { title: "Reports", sub: "Weekly labour and waste", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    title: "Recipes",
    tools: [
      { title: "Menu items", sub: "Costing, food cost %, selling price", href: "/dishes", icon: UtensilsCrossed },
      { title: "Preparations", sub: "Sub-recipes and batch costs", href: "/preparations", icon: ChefHat },
      { title: "Ingredients", sub: "Purchase prices, allergens, pars", href: "/ingredients", icon: Carrot },
    ],
  },
  {
    title: "Ordering",
    tools: [
      { title: "Suppliers", sub: "Invoices, PDFs, price history", href: "/suppliers", icon: Truck },
      { title: "Orders", sub: "Suggested and draft purchase orders", href: "/orders", icon: ShoppingCart },
      { title: "Order checklists", sub: "Per-supplier order forms", href: "/order-checklists", icon: ClipboardCheck },
      { title: "Departments", sub: "Who orders what", href: "/order-departments", icon: Users },
      { title: "Par levels", sub: "Suggested from usage, chef-accepted", href: "/par-levels", icon: Gauge },
      { title: "Old price alerts", sub: "Previous system, until cutover", href: "/price-alerts", icon: TrendingUp },
    ],
  },
  {
    title: "Kitchen",
    tools: [
      { title: "Checklists", sub: "HACCP runs and overdue checks", href: "/checklists", icon: ClipboardCheck, badge: "overdueChecklists" },
      { title: "Prep sheet", sub: "Forecast batches per prep", href: "/prep-sheet", icon: ClipboardList },
      { title: "Restock", sub: "Prep stock counts and sheets", href: "/restock", icon: PackageOpen },
      { title: "Stocktake", sub: "Count and variance", href: "/stocktake", icon: Boxes },
      { title: "Maintenance", sub: "Assets, issues, QR labels", href: "/maintenance", icon: Wrench },
      { title: "Services", sub: "Grease trap, pest, fire visits", href: "/services", icon: CalendarCheck },
      { title: "Commitments", sub: "Said and done", href: "/commitments", icon: Handshake },
      { title: "Meeting agenda", sub: "Raised and decided", href: "/meetings", icon: Megaphone },
    ],
  },
  {
    title: "Business",
    tools: [
      { title: "Reviews", sub: "Google reviews and drafted replies", href: "/reviews", icon: Star },
      { title: "Inbox playbooks", sub: "Email automation for hello@", href: "/inbox-playbooks", icon: Mail },
      { title: "Council folder", sub: "Everything an inspector asks for", href: "/council", icon: ShieldCheck },
      { title: "Settings", sub: "Integrations and connections", href: "/settings/integrations", icon: Settings },
    ],
  },
]
