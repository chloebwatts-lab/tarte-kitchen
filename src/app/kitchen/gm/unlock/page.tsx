export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { gmPasswordIsSet, isGmAuthed } from "@/lib/gm-auth"
import { GmUnlock } from "@/components/kitchen/GmUnlock"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function GmUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const next = typeof sp.next === "string" && sp.next.startsWith("/kitchen/gm") ? sp.next : "/kitchen/gm"
  if (await isGmAuthed()) redirect(next)
  const configured = await gmPasswordIsSet()

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver" }]} />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Oliver only
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Your desk. Stays unlocked on this device for 30 days.
        </p>
      </div>
      <GmUnlock next={next} configured={configured} />
    </div>
  )
}
