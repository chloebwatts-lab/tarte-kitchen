import { requireTier } from "@/lib/tier-auth"

/** The recipe bill of materials for every dish: Senior and up. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireTier("SENIOR")
  return <>{children}</>
}
