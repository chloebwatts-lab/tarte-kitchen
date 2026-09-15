import type { Metadata } from "next"

// Staff home-screen app: this section links the staff manifest only.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tarte", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
}

import "../kitchen/kitchen.css"

import { RefreshOnResume } from "@/components/kitchen/RefreshOnResume"

export default function StaffAccessLayout({ children }: { children: React.ReactNode }) {
  // Same kiosk shell as /kitchen, no sidebar, no login, iPad-first.
  return (
    <div className="tk-root min-h-screen" style={{ background: "var(--tk-bg)" }}>
      {/* Home-screen iPads resume days-old pages; refetch on resume. */}
      <RefreshOnResume />
      {children}
    </div>
  )
}
