"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { CommandSearch } from "@/components/command-search";
import { PriceAlertBanner } from "@/components/price-alert-banner";

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
  "/stocktake": "Stocktake",
  "/checklists": "Checklists",
  "/orders": "Orders",
  "/labour": "Labour",
  "/wastage/analytics": "Wastage Analytics",
};

function getPageTitle(pathname: string): string {
  for (const [prefix, title] of Object.entries(pageTitles)) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) {
      return title;
    }
  }
  return "Tarte Kitchen";
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <CommandSearch />

      {/* Main content area — offset by sidebar width (256px = w-64) */}
      <div className="flex flex-1 flex-col md:pl-64">
        <PriceAlertBanner />
        <Header title={title} />

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-6 py-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
