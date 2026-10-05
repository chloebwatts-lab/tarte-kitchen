import type { Metadata } from "next"

// Prep list home-screen app: the deep duck egg Prep icon. "Add to Home
// Screen" from any prep page installs this instead of the staff app, and
// opens straight on the prep list. The manifest is a static file under
// /icons so it sits outside Caddy basic auth without a Caddyfile change.
export const metadata: Metadata = {
  manifest: "/icons/prep.webmanifest",
  appleWebApp: { capable: true, title: "Prep", statusBarStyle: "default" },
  icons: { apple: "/icons/prep-apple-touch-icon.png" },
}

export default function PrepListLayout({ children }: { children: React.ReactNode }) {
  return children
}
