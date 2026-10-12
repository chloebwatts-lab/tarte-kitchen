import { requirePage } from "@/lib/tier-auth"

/** Customer names and booking notes: Senior and up, and not the copy-quiet list. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage("/kitchen/high-tea")
  return <>{children}</>
}
