import { requireTier } from "@/lib/tier-auth"

/** The functions pipeline and client names: Senior and up. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireTier("SENIOR")
  return <>{children}</>
}
