import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { ToolGrid } from "@/components/kitchen/ToolGrid"
import { groupBySlug } from "@/lib/staff-tools"
import { isQuietManager } from "@/lib/manager-auth"
import { copyVisibleTools, visibleTools } from "@/lib/manager-quiet"
import { getTier, isCopyQuiet } from "@/lib/tier-auth"
import { toolsForTier } from "@/lib/access/tiers"

export default async function StaffGroupPage({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params
  const g = groupBySlug(group)
  if (!g || g.locked) notFound()
  // Tiles above the person's tier are not offered; Price check sits in the
  // open stock group but is a managers page, and a quiet manager does not
  // get that tile either.
  const tools = copyVisibleTools(
    visibleTools(toolsForTier(g.tools, await getTier()), await isQuietManager()),
    await isCopyQuiet()
  )

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
          {g.title}
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-[18px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>{g.sub}</p>
      </div>
      <div className="mx-auto max-w-[1100px] px-6 pb-12 md:px-12">
        <ToolGrid tiles={tools} />
      </div>
    </div>
  )
}
