export const dynamic = "force-dynamic"

import { redirect } from "next/navigation"
import { isManagerAuthed } from "@/lib/manager-auth"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const next = typeof sp.next === "string" && sp.next.startsWith("/kitchen") ? sp.next : "/kitchen/managers"
  if (await isManagerAuthed()) redirect(next)

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
      <div className="rounded-[20px] border border-[var(--tk-line)] bg-white p-6 text-[16px] leading-snug text-[var(--tk-charcoal)]">
        <strong>Your sign in does not open this part.</strong>
        <p className="mt-1 text-[var(--tk-ink-soft)]">
          Access now comes from your own name and PIN, not a shared password. If you should be able to see this, ask Chloe to update your role.
        </p>
      </div>
    </div>
  )
}
