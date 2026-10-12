import { requirePage } from "@/lib/tier-auth"

/** Prep yields and portion grams: Senior and up, and not the copy-quiet list. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage("/kitchen/serves")
  return <>{children}</>
}
