import { requireManager } from "@/lib/manager-auth"

/** Names and commitments: managers only. */
export default async function Layout({ children }: { children: React.ReactNode }) {
  await requireManager("/kitchen/commitments")
  return <>{children}</>
}
