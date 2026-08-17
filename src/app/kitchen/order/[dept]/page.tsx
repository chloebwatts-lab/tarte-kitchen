export const dynamic = "force-dynamic"

import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { getDeptForm } from "@/lib/actions/dept-orders"
import { DeptOrderForm } from "@/components/kitchen/DeptOrderForm"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"
import { DEPT_BLURB, DEPT_LABEL, deptFromSlug } from "@/lib/departments"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function DeptOrderFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ dept: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { dept: deptSlug } = await params
  const dept = deptFromSlug(deptSlug)
  if (!dept) notFound()

  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const cookieVenue = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(venueParam)
    ? venueParam
    : isVenue(cookieVenue)
      ? cookieVenue
      : null
  if (!venue) return <KitchenVenuePicker />
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  const form = await getDeptForm({ venue, dept })

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Ordering", href: `/kitchen/order?venue=${venue}` },
          { label: DEPT_LABEL[dept] },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          {DEPT_LABEL[dept]} order
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          {DEPT_BLURB[dept]}. Put in how many <strong>packs</strong> you need,
          not weights. It saves as you go, so add things as you notice them
          through the day.
          {form.ownerName
            ? ` ${form.ownerName} checks and approves it at close.`
            : ""}
        </p>
      </div>

      <DeptOrderForm initialForm={form} />
    </div>
  )
}
