import { requireTier } from "@/lib/tier-auth"

/** Prep yields and portion grams: Senior and up. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireTier("SENIOR")
  return <>{children}</>
}
