import type { Metadata } from "next"

// Password gate dropped per Chloe 2026-08-05 — the folder needs to open
// instantly in front of an EHO. The trade-off (documents reachable without
// a password on a public URL) was flagged; noindex keeps it out of search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function CouncilAuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <div className="min-h-screen bg-background">{children}</div>
}
