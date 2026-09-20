export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { isGmAuthed } from "@/lib/gm-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function GmUnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const next = typeof sp.next === "string" && sp.next.startsWith("/kitchen/gm") ? sp.next : "/kitchen/gm"
  if (await isGmAuthed()) redirect(next)

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver" }]} />
      <div className="px-1">
        <div className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Oliver only
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Your desk. It opens with your own sign in.
        </p>
      </div>
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-6 text-[16px] leading-snug text-[var(--tk-charcoal)]">
        <strong>Your sign in does not open this part.</strong>
        <p className="mt-1 text-[var(--tk-ink-soft)]">
          Access now comes from your own name and PIN, not a shared password. If you should be able to see this, ask Chloe to update your role.
        </p>
      </div>
    </div>
  )
}
