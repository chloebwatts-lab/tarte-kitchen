import { requireTier } from "@/lib/tier-auth"

/** Customer names and booking notes: Senior and up. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireTier("SENIOR")
  return <>{children}</>
}
