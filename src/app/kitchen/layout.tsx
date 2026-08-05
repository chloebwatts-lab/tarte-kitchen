import "./kitchen.css"

import { RefreshOnResume } from "@/components/kitchen/RefreshOnResume"

export default function KitchenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // No sidebar, no header: the iPad view is a single-purpose kiosk-style
  // layout. Staff can't navigate away to accidentally open a full admin
  // page in the middle of service.
  return (
    <div
      className="tk-root min-h-screen"
      style={{ background: "var(--tk-bg)" }}
    >
      {/* iOS home-screen apps resume days-old pages from memory. Mounted
          once here so every kitchen page refetches on resume. */}
      <RefreshOnResume />
      <div className="mx-auto max-w-[1194px] px-6 py-5 md:px-10 md:py-8">
        {children}
      </div>
    </div>
  )
}
