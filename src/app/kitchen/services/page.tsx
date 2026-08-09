export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowRight, CalendarCheck, ClipboardCheck } from "lucide-react"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { ServicesCalendar } from "@/components/kitchen/ServicesCalendar"
import { getServicePrograms } from "@/lib/actions/services"

type Venue = "BURLEIGH" | "BEACH_HOUSE"

const VENUES: Array<{ key: Venue; title: string; sub: string }> = [
  { key: "BURLEIGH", title: "Burleigh", sub: "Tarte Bakery · 2 West Street" },
  { key: "BEACH_HOUSE", title: "Beach House", sub: "Currumbin · incl. Cafe, Restaurant & Tea Garden" },
]

function VenueLanding() {
  return (
    <div
      className="relative -mx-6 -my-5 min-h-screen overflow-hidden rounded-[14px] md:-mx-10 md:-my-8"
      style={{ background: "var(--tk-sage)" }}
    >
      <div className="flex items-center justify-between px-8 pt-8 md:px-12">
        <KitchenLogo onDark />
        <Link
          href="/staffaccess"
          className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <ClipboardCheck className="h-3.5 w-3.5" /> All staff tools
        </Link>
      </div>

      <div className="px-8 pt-14 pb-6 text-center md:px-12 md:pt-20">
        <h1
          className="tk-display mx-auto leading-none text-white"
          style={{ fontSize: "clamp(48px, 8vw, 80px)", fontWeight: 600, letterSpacing: "-0.035em" }}
        >
          Service calendar
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-[20px] leading-snug" style={{ color: "rgba(255,255,255,0.85)" }}>
          Grease trap, pest control, canopy cleans, fire checks, when they last
          happened and when they&apos;re coming back.
        </p>
      </div>

      <div className="mx-auto max-w-[800px] px-8 pb-8 md:px-12">
        <div className="grid gap-4 md:grid-cols-2">
          {VENUES.map((v) => (
            <Link
              key={v.key}
              href={`/kitchen/services?venue=${v.key}`}
              className="group flex min-h-[170px] flex-col justify-between rounded-[20px] bg-white/95 p-6 text-left transition active:scale-[0.99]"
              style={{ color: "var(--tk-charcoal)" }}
            >
              <div>
                <div className="tk-display leading-tight" style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em" }}>
                  {v.title}
                </div>
                <div className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">{v.sub}</div>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[14px] font-semibold text-[var(--tk-ink-soft)]">
                  <CalendarCheck className="h-4 w-4" /> See the calendar
                </span>
                <ArrowRight className="h-5 w-5 transition group-hover:translate-x-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

export default async function ServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  // Tea Garden services live under the Currumbin site, same as maintenance.
  const venue: Venue | null =
    venueParam === "BURLEIGH"
      ? "BURLEIGH"
      : venueParam === "BEACH_HOUSE" || venueParam === "TEA_GARDEN"
        ? "BEACH_HOUSE"
        : null

  if (!venue) return <VenueLanding />

  const programs = await getServicePrograms({ venue })
  const here = VENUES.find((v) => v.key === venue)!

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Staff tools", href: "/staffaccess" },
          { label: "Service calendar", href: "/kitchen/services" },
          { label: here.title },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <div className="tk-caps text-[13px] text-[var(--tk-ink-mute)]">Service calendar</div>
          <div
            className="tk-display leading-none text-[var(--tk-charcoal)]"
            style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            {here.title}
          </div>
          <div className="mt-1 text-[14px] text-[var(--tk-ink-soft)]">{here.sub}</div>
        </div>
        <div className="flex rounded-2xl border border-[var(--tk-line)] bg-[var(--tk-card)] p-1">
          {VENUES.map((v) => (
            <Link
              key={v.key}
              href={`/kitchen/services?venue=${v.key}`}
              className={`rounded-xl px-5 py-3 text-[16px] font-bold transition ${
                v.key === venue
                  ? "bg-[var(--tk-charcoal)] text-white"
                  : "text-[var(--tk-ink-soft)] hover:text-[var(--tk-charcoal)]"
              }`}
            >
              {v.title}
            </Link>
          ))}
        </div>
      </div>

      <ServicesCalendar programs={programs} />
    </div>
  )
}
