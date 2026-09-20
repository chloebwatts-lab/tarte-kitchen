import type { Metadata } from "next"

// Staff home-screen app: this section links the staff manifest only.
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Tarte", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
}

import "../kitchen/kitchen.css"
import Link from "next/link"
import { LayoutGrid } from "lucide-react"
import { RefreshOnResume } from "@/components/kitchen/RefreshOnResume"
import { Suspense } from "react"
import { StaffShell } from "@/components/kitchen/StaffShell"

export default function LogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Mirrors the /kitchen kiosk layout, same tokens, same proportions, so
  // the wastage entry page reads as part of the same in-store iPad app.
  return (
    <div
      className="tk-root min-h-screen"
      style={{ background: "var(--tk-bg)" }}
    >
      {/* Home-screen iPads resume days-old pages; refetch on resume. */}
      <RefreshOnResume />
      <Suspense fallback={null}>
        <StaffShell />
      </Suspense>
      <div className="mx-auto max-w-[1194px] px-6 py-5 md:px-10 md:py-8">
        <div className="mb-4 flex justify-end">
          <Link
            href="/staffaccess"
            className="flex items-center gap-2 rounded-full bg-[var(--tk-charcoal)] px-4 py-2 text-[13px] font-bold text-white transition active:scale-95"
          >
            <LayoutGrid className="h-4 w-4" /> Staff tools
          </Link>
        </div>
        {children}
      </div>
    </div>
  )
}
