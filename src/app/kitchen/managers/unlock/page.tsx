export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { isManagerAuthed, isManagerDenied, managerPasswordIsSet } from "@/lib/manager-auth"
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
  const denied = await isManagerDenied()

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
      {denied ? (
        <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-6 text-[16px] leading-snug text-[var(--tk-charcoal)]">
          <strong>Your sign in does not open this part.</strong>
          <p className="mt-1 text-[var(--tk-ink-soft)]">If you think it should, talk to Chloe.</p>
        </div>
      ) : (
        <ManagerUnlock next={next} configured={configured} />
      )}
    </div>
  )
}
