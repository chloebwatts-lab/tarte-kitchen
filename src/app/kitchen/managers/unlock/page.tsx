export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { isManagerAuthed, managerPasswordIsSet } from "@/lib/manager-auth"
import { ManagerUnlock } from "@/components/kitchen/ManagerUnlock"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const next = typeof sp.next === "string" && sp.next.startsWith("/kitchen") ? sp.next : "/kitchen/managers"
  if (await isManagerAuthed()) redirect(next)
  const configured = await managerPasswordIsSet()

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Managers" }]} />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Managers only
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          This part has yesterday&apos;s numbers and people&apos;s names in it.
        </p>
      </div>
      <ManagerUnlock next={next} configured={configured} />
    </div>
  )
}
