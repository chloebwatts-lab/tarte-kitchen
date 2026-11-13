export const dynamic = "force-dynamic"

import { requireGm } from "@/lib/gm-auth"
import { listSignOns } from "@/lib/actions/council"
import { SCRIPT } from "@/lib/council/sign-on"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenButton } from "@/components/kitchen/KitchenButton"
import { GmCouncil } from "@/components/kitchen/GmCouncil"

export default async function GmCouncilPage() {
  await requireGm("/kitchen/gm/council")
  const rows = await listSignOns()

  return (
    <div className="mx-auto max-w-[860px] space-y-6 pb-16">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Oliver", href: "/kitchen/gm" }, { label: "Council" }]} />
      <div className="px-1">
        <p className="tk-caps text-[var(--tk-ink-soft)]">Council</p>
        <h1 className="tk-display leading-none text-[var(--tk-charcoal)]" style={{ fontSize: "clamp(34px, 6vw, 48px)", fontWeight: 700, letterSpacing: "-0.025em" }}>
          Footpath dining fee
        </h1>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Get every Burleigh venue with footpath tables to sign the letter to Council. Back to Chloe by Fri 27 Nov. Every signature saves straight to the Kitchen app and is backed up nightly.
        </p>
      </div>

      <details open className="rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-card)] p-4 md:p-5">
        <summary className="cursor-pointer text-[18px] font-semibold">Your script</summary>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {SCRIPT.map((s) => (
            <div key={s.heading} className="min-w-0">
              <p className="tk-caps text-[var(--tk-ink-soft)]">{s.heading}</p>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[16px] leading-snug">
                {s.points.map((p) => <li key={p}>{p}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </details>

      <GmCouncil initial={rows} />

      <KitchenButton href="/kitchen/gm/council/sheet" variant="secondary" size="lg" className="w-full">Filed copy for Chloe (print or save as PDF)</KitchenButton>
    </div>
  )
}
