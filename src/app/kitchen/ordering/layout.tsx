import { requirePage } from "@/lib/tier-auth"

/** Where to buy, with supplier rep contacts: Senior and up, and not the copy-quiet list. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage("/kitchen/ordering")
  return <>{children}</>
}
