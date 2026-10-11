import { requireFullManager } from "@/lib/manager-auth"

/** Names and commitments: managers only. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireFullManager("/kitchen/training")
  return <>{children}</>
}
