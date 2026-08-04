import Link from "next/link"
import type { Metadata } from "next"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { OrderingBrowser } from "./ordering-browser"

export const metadata: Metadata = { title: "Ordering & supplies" }

export default function OrderingPage() {
  return (
    <div className="space-y-8">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: "Ordering & supplies" },
        ]}
      />

      <div>
        <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
          Staff reference
        </div>
        <h1
          className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}
        >
          Ordering &amp; supplies
        </h1>
        <p className="mt-2 max-w-xl text-[15px] text-[var(--tk-ink-soft)]">
          Where we buy what, and who to call. For broken equipment use{" "}
          <Link href="/kitchen/fix" className="font-semibold underline">
            Something broken?
          </Link>{" "}
          instead, it knows warranties and the right tech per machine.
        </p>
      </div>

      <OrderingBrowser />
    </div>
  )
}
