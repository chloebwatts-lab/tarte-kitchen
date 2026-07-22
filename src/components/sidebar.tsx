"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Carrot,
  ChefHat,
  UtensilsCrossed,
  Truck,
  BarChart3,
  LineChart,
  LayoutGrid,
  ClipboardList,
  ClipboardCheck,
  Boxes,
  ShoppingCart,
  Users,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Receipt,
  Activity,
  Settings,
  ShieldCheck,
  Star,
  Gauge,
  Mail,
  TrendingUp,
  PackageOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type NavGroup = {
  label: string | null;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    label: null,
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Recipes",
    items: [
      { label: "Ingredients", href: "/ingredients", icon: Carrot },
      { label: "Preparations", href: "/preparations", icon: ChefHat },
      { label: "Menu Items", href: "/dishes", icon: UtensilsCrossed },
    ],
  },
  {
    label: "Kitchen",
    items: [
      { label: "Prep Sheet", href: "/prep-sheet", icon: ClipboardList },
      { label: "Restock", href: "/restock", icon: PackageOpen },
      { label: "Checklists", href: "/checklists", icon: ClipboardCheck },
      { label: "Stocktake", href: "/stocktake", icon: Boxes },
      { label: "Wastage", href: "/wastage", icon: Trash2 },
    ],
  },
  {
    label: "Ordering",
    items: [
      { label: "Suppliers", href: "/suppliers", icon: Truck },
      { label: "Price Alerts", href: "/price-alerts", icon: TrendingUp },
      { label: "Orders", href: "/orders", icon: ShoppingCart },
      { label: "Order Checklists", href: "/order-checklists", icon: ClipboardCheck },
      { label: "Par Levels", href: "/par-levels", icon: Gauge },
    ],
  },
  {
    label: "Performance",
    items: [
      { label: "COGS", href: "/cogs", icon: Receipt },
      { label: "Live Spend", href: "/spend", icon: Activity },
      { label: "Labour", href: "/labour", icon: Users },
      { label: "Analysis", href: "/analysis", icon: LineChart },
      { label: "Menu Matrix", href: "/menu-engineering", icon: LayoutGrid },
      { label: "Reports", href: "/reports", icon: BarChart3 },
    ],
  },
  {
    label: "Business",
    items: [
      { label: "Reviews", href: "/reviews", icon: Star },
      { label: "Inbox Playbooks", href: "/inbox-playbooks", icon: Mail },
      { label: "Council Folder", href: "/council", icon: ShieldCheck },
      { label: "Settings", href: "/settings/integrations", icon: Settings },
    ],
  },
];

/**
 * Pages a restricted (non-`tarte`) user is allowed to see in the
 * sidebar. Anything missing here would prefetch on hover and trigger
 * a phantom basic-auth prompt for shawna et al.
 */
const RESTRICTED_USER_ALLOWED_HREFS = new Set<string>([
  "/reviews",
  "/inbox-playbooks",
])

export function Sidebar({
  restrictedUser,
  collapsed,
  setCollapsed,
}: {
  /** null = full access (the `tarte` operator). Any string = limited
   * user (e.g. "shawna") — sidebar collapses to the allow-list. */
  restrictedUser?: string | null
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}) {
  const pathname = usePathname();

  // On phones the sidebar is an overlay — never leave it open across a
  // page load / navigation (it used to cover every page on mobile).
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const visibleGroups = navGroups
    .map((group) => ({
      ...group,
      items: restrictedUser
        ? group.items.filter((i) => RESTRICTED_USER_ALLOWED_HREFS.has(i.href))
        : group.items,
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      {/* Mobile overlay */}
      {!collapsed && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setCollapsed(true)}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col bg-sage transition-all duration-200",
          collapsed ? "w-16" : "w-64",
          "max-md:shadow-lg",
          collapsed && "max-md:-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/30 px-4">
          {!collapsed && (
            <span className="flex items-baseline gap-2.5">
              <span className="font-serif text-[22px] font-semibold leading-none tracking-tight text-white">
                Tarte.
              </span>
              <span className="font-serif text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground/70">
                Kitchen
              </span>
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-md p-1.5 text-foreground/60 hover:bg-white/40 hover:text-foreground"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 pb-4 pt-2">
          {visibleGroups.map((group, gi) => (
            <div key={group.label ?? gi}>
              {group.label ? (
                collapsed ? (
                  <div className="mx-2 my-2 border-t border-white/30" />
                ) : (
                  <div className="px-3 pb-1 pt-4 font-serif text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/60">
                    {group.label}
                  </div>
                )
              ) : null}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                        isActive
                          ? "bg-white font-medium text-foreground shadow-sm"
                          : "text-foreground/90 hover:bg-white/50 hover:text-foreground"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isActive && "text-sage-deep"
                        )}
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="shrink-0 border-t border-white/30 p-3">
          {!collapsed && (
            <span className="text-xs text-foreground/60">
              Tarte Bakery &amp; Café
            </span>
          )}
        </div>
      </aside>
    </>
  );
}

/** Toggle button shown in the header on mobile, where the sidebar is
 *  an off-canvas overlay and needs a way back in. */
export function SidebarMobileTrigger({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="-ml-2 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
      title="Open menu"
    >
      <PanelLeft className="h-5 w-5" />
    </button>
  );
}
