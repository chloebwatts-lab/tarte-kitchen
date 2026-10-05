import type { Metadata } from "next"

// Sales insights home-screen app: gold $$ on charcoal. "Add to Home Screen"
// from this page installs it and opens straight on sales (still behind the
// staff sign-in and the managers password). Same pattern as the Prep app
// in src/app/kitchen/restock/layout.tsx.
export const metadata: Metadata = {
  manifest: "/icons/sales.webmanifest",
  appleWebApp: { capable: true, title: "Sales", statusBarStyle: "default" },
  icons: { apple: "/icons/sales-apple-touch-icon.png" },
}

export default function SalesInsightsLayout({ children }: { children: React.ReactNode }) {
  return children
}
