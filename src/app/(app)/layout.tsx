import type { Metadata } from "next";
import { headers } from "next/headers";
import { AppLayoutClient } from "./AppLayoutClient";

// The office side installs as its own home-screen app ("Tarte HQ"), with
// its own manifest and icon, separate from the staff app. Only this
// manifest is linked on office pages, so Add to Home Screen from /home
// installs Tarte HQ, never the staff tools.
export const metadata: Metadata = {
  manifest: "/office.webmanifest",
  appleWebApp: { capable: true, title: "Tarte HQ", statusBarStyle: "default" },
  icons: { apple: "/icons/office-apple-touch-icon.png" },
};

/**
 * Server wrapper, reads the X-Auth-User header Caddy forwards (the
 * basic-auth username) and hands it to the client layout so the
 * sidebar can hide nav items for restricted users like Shawna.
 *
 * `tarte` (the main operator account) gets the full sidebar. Anyone
 * else only sees pages they're actually authorised for, so prefetch
 * doesn't trigger phantom login prompts.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const authUser = h.get("x-auth-user");
  return <AppLayoutClient authUser={authUser}>{children}</AppLayoutClient>;
}
