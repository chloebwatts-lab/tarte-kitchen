import Link from "next/link"
import { ArrowRight, Clock } from "lucide-react"
import { SINGLE_VENUES, VENUE_LABEL } from "@/lib/venues"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"

const VENUE_SUB: Record<(typeof SINGLE_VENUES)[number], string> = {
  BURLEIGH: "Burleigh Heads",
  BEACH_HOUSE: "Currumbin · Beach House",
  TEA_GARDEN: "Currumbin · Tea Garden",
}

function formatNow() {
  const now = new Date()
  return now.toLocaleString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Australia/Sydney",
  })
}

export function KitchenVenuePicker() {
  return (
    <div
      className="relative -mx-6 -my-5 min-h-[calc(100vh-0px)] overflow-hidden rounded-[14px] md:-mx-10 md:-my-8"
      style={{ background: "var(--tk-sage)" }}
    >
      {/* top bar */}
      <div className="flex items-center justify-between px-8 pt-8 md:px-12">
        <KitchenLogo onDark />
        <div
          className="flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold text-white"
          style={{ background: "rgba(255,255,255,0.15)" }}
        >
          <Clock className="h-3.5 w-3.5" />
          <span>{formatNow()}</span>
        </div>
      </div>

      {/* hero */}
      <div className="px-8 pt-16 pb-6 text-center md:px-12 md:pt-24">
        <h1
          className="tk-display mx-auto leading-none text-white"
          style={{
            fontSize: "clamp(64px, 10vw, 96px)",
            fontWeight: 600,
            letterSpacing: "-0.035em",
          }}
        >
          Checklists
        </h1>
        <p
          className="mx-auto mt-5 max-w-xl text-[20px] leading-snug"
          style={{ color: "rgba(255,255,255,0.85)" }}
        >
          Cleaning and food temperature logs, all in one place. Pick a venue to
          begin.
        </p>
      </div>

      {/* 1×3 venue grid */}
      <div className="mx-auto max-w-[980px] px-8 pb-10 md:px-12">
        <div className="grid gap-4 md:grid-cols-3">
          {SINGLE_VENUES.map((v) => (
            <Link
              key={v}
              href={`/kitchen?venue=${v}`}
              className="group flex min-h-[180px] flex-col justify-between rounded-[20px] bg-white/95 p-6 text-left transition active:scale-[0.99]"
              style={{ color: "var(--tk-charcoal)" }}
            >
              <div>
                <div
                  className="tk-display leading-tight"
                  style={{
                    fontSize: 26,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  {VENUE_LABEL[v].replace(/\s*\(.*\)$/, "")}
                </div>
                <div
                  className="mt-1 text-[14px]"
                  style={{ color: "var(--tk-ink-soft)" }}
                >
                  {VENUE_SUB[v]}
                </div>
              </div>
              <div className="flex items-end justify-between">
                <span className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
                  Open station
                </span>
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white"
                  style={{ background: "var(--tk-sage-soft)", color: "var(--tk-ink-soft)" }}
                >
                  <ArrowRight className="h-[18px] w-[18px]" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div
        className="pb-7 text-center tk-caps"
        style={{ color: "rgba(255,255,255,0.65)" }}
      >
        Stays on this venue until you change it
      </div>
    </div>
  )
}
