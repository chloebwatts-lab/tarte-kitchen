import { headers } from "next/headers";
import { AppLayoutClient } from "./AppLayoutClient";

/**
 * Server wrapper — reads the X-Auth-User header Caddy forwards (the
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
