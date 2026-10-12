import { requirePage } from "@/lib/tier-auth"

/** The end-of-day order with supplier emails: Senior and up, and not the copy-quiet list. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requirePage("/kitchen/order/sheet")
  return <>{children}</>
}
