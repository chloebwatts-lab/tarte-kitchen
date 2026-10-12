import { requireTier } from "@/lib/tier-auth"

/** Ordering, the department forms and the order sheet: Senior and up. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireTier("SENIOR")
  return <>{children}</>
}
