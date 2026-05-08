import { requireCouncil } from "@/lib/council-auth"

export default async function CouncilAuthedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireCouncil()
  return <div className="min-h-screen bg-stone-50">{children}</div>
}
