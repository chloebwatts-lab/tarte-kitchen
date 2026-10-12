import { requireTier } from "@/lib/tier-auth"

/** Where to buy, with supplier rep contacts: Senior and up. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireTier("SENIOR")
  return <>{children}</>
}
