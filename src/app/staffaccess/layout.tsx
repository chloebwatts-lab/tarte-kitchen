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
