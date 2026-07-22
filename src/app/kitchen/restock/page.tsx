export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  ArrowRight,
  ClipboardList,
  FileText,
  Moon,
  Sunrise,
} from "lucide-react"
import { getRestockHub } from "@/lib/actions/restock"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"
import { STATION_LABEL } from "@/lib/stations"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

export default async function RestockHubPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BEACH_HOUSE"
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")

  const hub = await getRestockHub(venue)

  return (
    <div className="space-y-8">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Restock & prep" },
        ]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Restock &amp; prep
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Closing chefs count each kitchen at the end of the shift. The prep
          chef runs one consolidated list next morning and restocks both
          kitchens before service.
        </p>
      </div>

      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
          <Moon className="mr-1.5 inline h-3.5 w-3.5" />
          End of shift — count your kitchen
        </div>
        {hub.stations.map(({ station, todaySheet }) => {
          const status = todaySheet?.status
          const chip =
            status === "RESTOCKED"
              ? { label: "Restocked", bg: "var(--tk-done-soft)", fg: "var(--tk-done)" }
              : status === "SUBMITTED"
                ? { label: "Sent to prep", bg: "var(--tk-gold-soft)", fg: "#8a6d1f" }
                : status === "IN_PROGRESS"
                  ? { label: "Counting…", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" }
                  : { label: "Not started", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" }
          return (
            <Link
              key={station}
              href={`/kitchen/restock/count?venue=${venue}&station=${station}`}
              className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
            >
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
                style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
              >
                <ClipboardList className="h-6 w-6" strokeWidth={1.8} />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]"
                  style={{ letterSpacing: "-0.01em" }}
                >
                  {STATION_LABEL[station]}
                </div>
                <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
                  {todaySheet
                    ? `${todaySheet.countedLines} counted · ${todaySheet.requestedLines} requested${todaySheet.countedBy ? ` · ${todaySheet.countedBy}` : ""}`
                    : "Tonight's count not started"}
                </div>
              </div>
              <div
                className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
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
          <Sunrise className="mr-1.5 inline h-3.5 w-3.5" />
          Morning — prep chef
        </div>
        <Link
          href={`/kitchen/restock/run?venue=${venue}`}
          className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
          >
            <Sunrise className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              Restock run
            </div>
            <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              {hub.pendingRunSheets > 0
                ? `${hub.pendingRunSheets} kitchen count${hub.pendingRunSheets === 1 ? "" : "s"} waiting — one consolidated list`
                : "No counts waiting right now"}
            </div>
          </div>
          {hub.pendingRunSheets > 0 && (
            <div
              className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
            >
              Ready
            </div>
          )}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
            <ArrowRight className="h-[18px] w-[18px]" />
          </div>
        </Link>

        <Link
          href={`/kitchen/restock/report?venue=${venue}`}
          className="group flex min-h-[72px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
            style={{ background: "var(--tk-bg)", color: "var(--tk-ink-soft)" }}
          >
            <FileText className="h-6 w-6" strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]"
              style={{ letterSpacing: "-0.01em" }}
            >
              Daily prep stock report
            </div>
            <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
              Counted vs requested vs supplied, shortfalls highlighted
              {hub.lastRestock?.restockedBy
                ? ` · last run by ${hub.lastRestock.restockedBy}`
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
