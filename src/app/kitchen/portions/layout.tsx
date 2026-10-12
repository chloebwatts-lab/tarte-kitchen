import { requirePage } from "@/lib/tier-auth"

/** The recipe bill of materials for every dish: Senior and up, and not the copy-quiet list. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage("/kitchen/portions")
  return <>{children}</>
}
