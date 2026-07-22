"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarMobileTrigger } from "@/components/sidebar";
import { Header } from "@/components/header";
import { CommandSearch } from "@/components/command-search";
import { PriceAlertBanner } from "@/components/price-alert-banner";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/ingredients": "Ingredients",
  "/preparations": "Preparations",
  "/dishes": "Menu Items",
  "/suppliers": "Suppliers",
  "/wastage": "Wastage",
  "/settings": "Settings",
  "/reports": "Reports",
  "/menu-engineering": "Menu Matrix",
  "/prep-sheet": "Prep Sheet",
  "/restock": "Restock & Prep Counts",
  "/stocktake": "Stocktake",
  "/checklists": "Checklists",
  "/orders": "Orders",
  "/order-checklists": "Order Checklists",
  "/par-levels": "Par Levels",
  "/labour": "Labour",
  "/labour/upload": "Upload payroll",
  "/spend": "Live Spend",
  "/cogs": "COGS",
  "/analysis": "Analysis",
  "/price-alerts": "Price Alerts",
  "/council": "Council Folder",
  "/inbox-playbooks": "Inbox Playbooks",
  "/wastage/analytics": "Wastage Analytics",
  "/reviews": "Google Reviews",
};

function getPageTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(pageTitles)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return title;
    }
  }
  return "Tarte Kitchen";
}

export function AppLayoutClient({
  authUser,
  children,
}: {
  /** Basic-auth username forwarded from Caddy. "tarte" sees everything;
   *  "shawna" / "Shawna" only sees Reviews + Inbox Playbooks. */
  authUser: string | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Anyone other than the main `tarte` operator is a restricted user.
  // Hide command search (which fetches ingredient/dish lists she can't
  // see) and the price-alert banner. Sidebar collapses to the pages she
  // can actually open.
  const isFullAccess = authUser === null || authUser === "tarte";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        restrictedUser={isFullAccess ? null : authUser}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />
      {isFullAccess && <CommandSearch />}

      <div
        className={cn(
          "flex flex-1 flex-col transition-all duration-200",
          sidebarCollapsed ? "md:pl-16" : "md:pl-64"
        )}
      >
        {isFullAccess && <PriceAlertBanner />}
        <Header title={title}>
          <SidebarMobileTrigger onOpen={() => setSidebarCollapsed(false)} />
        </Header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
