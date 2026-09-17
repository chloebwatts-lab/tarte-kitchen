export const dynamic = "force-dynamic"

import Link from "next/link"
import { cookies } from "next/headers"
import { ArrowRight, Check, ClipboardList, Send } from "lucide-react"
import { getDeptOrderHub } from "@/lib/actions/dept-orders"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VENUE_LABEL } from "@/lib/venues"
import {
  DEPT_BLURB,
  DEPT_COLOR,
  DEPT_LABEL,
  DEPT_SLUG,
} from "@/lib/departments"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function DeptOrderHubPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  // Explicit ?venue= wins; otherwise use the venue remembered by the
  // picker's tk-venue cookie. Never silently default to a venue.
  const cookieVenue = (await cookies()).get("tk-venue")?.value ?? null
  const venue: Venue | null = isVenue(venueParam)
    ? venueParam
    : isVenue(cookieVenue)
      ? cookieVenue
      : null
  if (!venue) return <KitchenVenuePicker />
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  const hub = await getDeptOrderHub(venue)

  return (
    <div className="space-y-8">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Ordering" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Ordering
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Open your section and put in what you need through the day. Your
          department head checks it at close. Once every section is in, the
          whole lot goes out as one order per supplier.
        </p>
        <p className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">
          {hub.dateLabel}
        </p>
      </div>

      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
          <ClipboardList className="mr-1.5 inline h-3.5 w-3.5" />
          Your section
        </div>
        {hub.depts.map((card) => {
          const color = DEPT_COLOR[card.dept]
          const chip =
            card.status === "APPROVED"
              ? { label: "In", bg: "var(--tk-done-soft)", fg: "var(--tk-done)" }
              : card.status === "OPEN"
                ? { label: "Open", bg: "var(--tk-gold-soft)", fg: "#8a6d1f" }
                : {
                    label: "Not started",
                    bg: "var(--tk-charcoal-soft)",
                    fg: "var(--tk-ink-soft)",
                  }
          return (
            <Link
              key={card.dept}
              href={`/kitchen/order/${DEPT_SLUG[card.dept]}?venue=${venue}`}
              className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] text-[17px] font-bold"
                style={{ background: color.bg, color: color.fg }}
              >
                {DEPT_LABEL[card.dept].charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {DEPT_LABEL[card.dept]}
                  {card.ownerName ? (
                    <span className="ml-2 text-[14px] font-normal text-[var(--tk-ink-soft)]">
                      {card.ownerName}
                    </span>
                  ) : null}
                </div>
                <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
                  {card.requestedLines > 0
                    ? `${card.requestedLines} item${card.requestedLines === 1 ? "" : "s"} · $${card.total.toFixed(2)}${card.approvedBy ? ` · approved by ${card.approvedBy}` : ""}`
                    : DEPT_BLURB[card.dept]}
                </div>
              </div>
              <div
                className="hidden shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold sm:block"
                style={{ background: chip.bg, color: chip.fg }}
              >
                {chip.label}
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
                <ArrowRight className="h-[18px] w-[18px]" />
              </div>
            </Link>
          )
        })}
      </div>

      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
          <Send className="mr-1.5 inline h-3.5 w-3.5" />
          End of day
        </div>
        <Link
          href={`/kitchen/order/sheet?venue=${venue}`}
          className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{
              background: hub.allIn ? "var(--tk-done-soft)" : "var(--tk-gold-soft)",
              color: hub.allIn ? "var(--tk-done)" : "#8a6d1f",
            }}
          >
            {hub.allIn ? (
              <Check className="h-6 w-6" strokeWidth={1.8} />
            ) : (
              <Send className="h-6 w-6" strokeWidth={1.8} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              Order sheet
            </div>
            <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              {hub.suppliersWaiting > 0
                ? `${hub.suppliersWaiting} supplier${hub.suppliersWaiting === 1 ? "" : "s"} ready to send`
                : hub.suppliersSent > 0
                  ? `${hub.suppliersSent} order${hub.suppliersSent === 1 ? "" : "s"} sent today`
                  : "Everything from every section, grouped by supplier"}
              {!hub.allIn
                ? ` · waiting on ${hub.depts
                    .filter((d) => d.status !== "APPROVED")
                    .map((d) => DEPT_LABEL[d.dept])
                    .join(", ")}`
                : ""}
            </div>
          </div>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
            <ArrowRight className="h-[18px] w-[18px]" />
          </div>
        </Link>
      </div>
    </div>
  )
}
