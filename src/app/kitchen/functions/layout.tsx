import { requirePage } from "@/lib/tier-auth"

/** The functions pipeline and client names: Senior and up, and not the copy-quiet list. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage("/kitchen/functions")
  return <>{children}</>
}
