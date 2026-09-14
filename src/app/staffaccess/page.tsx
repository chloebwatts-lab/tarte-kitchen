import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { ToolGrid } from "@/components/kitchen/ToolGrid"
import { TOOL_GROUPS } from "@/lib/staff-tools"

export default function StaffAccessPage() {
  const tiles = TOOL_GROUPS.map((g) => ({
    title: g.title,
    sub: g.sub,
    href: g.href ?? `/staffaccess/${g.slug}`,
    icon: g.icon,
    locked: g.locked,
  }))
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "var(--tk-sage)" }}>
      <div className="flex items-center justify-between px-8 pt-8 md:px-12">
        <KitchenLogo onDark />
      </div>
      <div className="px-8 pt-10 pb-6 text-center md:px-12 md:pt-14">
        <h1 className="tk-display mx-auto leading-none text-white" style={{ fontSize: "clamp(48px, 8vw, 80px)", fontWeight: 600, letterSpacing: "-0.035em" }}>
          Staff tools
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[19px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
          Pick what you&apos;re here to do. Bookmark this page.
        </p>
      </div>
      <div className="mx-auto max-w-[1100px] px-6 pb-12 md:px-12">
        <ToolGrid tiles={tiles} big />
      </div>
    </div>
  )
}
