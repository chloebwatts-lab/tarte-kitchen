import type { Metadata } from "next"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { PrinterTroubleshooter } from "@/components/kitchen/PrinterTroubleshooter"
import { LIGHTSPEED_IPAD_LOGIN } from "@/lib/printers-login"
import { hasTier } from "@/lib/tier-auth"

export const metadata: Metadata = { title: "Printer down?" }
export const dynamic = "force-dynamic"

export default async function PrintersPage() {
  // The till login is Manager and up; everyone else gets the fix steps only.
  const login = (await hasTier("MANAGER")) ? LIGHTSPEED_IPAD_LOGIN : null
  return (
    <div className="space-y-6 md:space-y-8">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: "Printer down?" },
        ]}
      />

      <div>
        <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
          Epson docket printers
        </div>
        <h1
          className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}
        >
          Printer down?
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-[var(--tk-ink-soft)]">
          Work from the top. Each stage rules out one cause, so do not skip ahead. Tick
          each step as you go. Most printer outages are fixed by stage 2. Written for
          Burleigh, but the same order of checks applies at Currumbin.
        </p>
      </div>

      <PrinterTroubleshooter login={login} />
    </div>
  )
}
