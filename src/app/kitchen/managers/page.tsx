export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, Percent } from "lucide-react"
import { isQuietManager, requireManager } from "@/lib/manager-auth"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { ToolGrid } from "@/components/kitchen/ToolGrid"
import { groupBySlug } from "@/lib/staff-tools"
import { visibleTools } from "@/lib/manager-quiet"
import { maySeeNumbers } from "@/lib/numbers-auth"
import { NUMBERS_HREF } from "@/lib/numbers-access"

export default async function ManagersPage() {
  await requireManager("/kitchen/managers")
  const g = groupBySlug("managers")!
  const base = visibleTools(g.tools, await isQuietManager())
  // Wages + COGS is not in the shared tile list (staff-tools.ts) on purpose:
  // it is added here, for Chloe and Shawna only, so no other grid that
  // reads that list can ever show it (numbers-access.ts).
  const tools = (await maySeeNumbers())
    ? [{ title: "Wages + COGS", sub: "Live wage % and COGS for the week. You and Shawna only", href: NUMBERS_HREF, icon: Percent }, ...base]
    : base
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--tk-sage)" }}>
      <div className="flex items-center justify-between px-8 pt-8 md:px-12">
        <KitchenLogo onDark />
        <Link href="/staffaccess" className="flex items-center gap-1.5 text-[15px] font-semibold text-white/90">
          <ArrowLeft className="h-4 w-4" /> Staff tools
        </Link>
      </div>
      <div className="px-8 pt-10 pb-6 text-center md:px-12 md:pt-14">
        <h1 className="tk-display mx-auto leading-none text-white" style={{ fontSize: "clamp(40px, 7vw, 64px)", fontWeight: 600, letterSpacing: "-0.035em" }}>
          Managers
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[18px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
          Numbers and names live here. Unlocked for 12 hours on this device.
        </p>
      </div>
      <div className="mx-auto max-w-[1100px] px-6 pb-12 md:px-12">
        <ToolGrid tiles={tools} />
      </div>
    </div>
  )
}
