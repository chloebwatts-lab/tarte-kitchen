"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Carrot,
  ChefHat,
  UtensilsCrossed,
  Truck,
  BarChart3,
  PanelLeftClose,
  PanelLeft,
  Trash2,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Ingredients", href: "/ingredients", icon: Carrot },
  { label: "Preparations", href: "/preparations", icon: ChefHat },
  { label: "Menu Items", href: "/dishes", icon: UtensilsCrossed },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Wastage", href: "/wastage", icon: Trash2 },
  { label: "Reports", href: "/reports", icon: BarChart3 },
  { label: "Settings", href: "/settings/integrations", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

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
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-background transition-all duration-200",
          collapsed ? "w-16" : "w-64",
          "max-md:shadow-lg",
          collapsed && "max-md:-translate-x-full"
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          {!collapsed && (
            <span className="text-lg font-bold tracking-tight text-foreground">
              Tarte Kitchen
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-muted font-medium text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border p-3">
          {!collapsed && (
            <span className="text-xs text-muted-foreground">v0.1</span>
          )}
        </div>
      </aside>
    </>
  );
}

/** Toggle button shown on mobile when sidebar is collapsed */
export function SidebarMobileTrigger({
  onOpen,
}: {
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
    >
      <PanelLeft className="h-5 w-5" />
    </button>
  );
}
