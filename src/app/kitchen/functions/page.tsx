export const dynamic = "force-dynamic"

import { ArrowUpRight, CalendarDays, PartyPopper, Users } from "lucide-react"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { FUNCTIONS_APP_URL, getUpcomingFunctions } from "@/lib/functions/calendar"

function dayHeading(day: string, today: string): string {
  const d = new Date(`${day}T12:00:00+10:00`)
  const label = d.toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Australia/Brisbane",
  })
  return day === today ? `Today, ${label}` : label
}

export default async function FunctionsPage() {
  const result = await getUpcomingFunctions(90)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date())

  return (
    <div className="space-y-8">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "Functions" }]} />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Functions
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          What is booked, and the functions app for run sheets, orders and dietaries.
        </p>
      </div>

      <a
        href={FUNCTIONS_APP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
          style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
        >
          <PartyPopper className="h-6 w-6" strokeWidth={1.8} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[19px] font-semibold leading-snug text-[var(--tk-charcoal)]" style={{ letterSpacing: "-0.01em" }}>
            Open the functions app
          </div>
          <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
            Run sheets, orders, dietaries and invoices. Sign in with your functions account.
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
          <ArrowUpRight className="h-[18px] w-[18px]" />
        </div>
      </a>

      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
          <CalendarDays className="mr-1.5 inline h-3.5 w-3.5" />
          Coming up: next 90 days
        </div>

        {!result.ok ? (
          <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
            The calendar could not be loaded. {result.reason}
          </div>
        ) : result.days.length === 0 ? (
          <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
            Nothing booked in the next 90 days.
          </div>
        ) : (
          result.days.map((d) => (
            <div key={d.day} className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4">
              <div className="text-[15px] font-semibold text-[var(--tk-charcoal)]">{dayHeading(d.day, today)}</div>
              <div className="mt-2 divide-y divide-[var(--tk-line)]">
                {d.events.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                    <div className="w-[150px] shrink-0 text-[14px] font-semibold tabular-nums text-[var(--tk-ink-soft)]">
                      {e.time ? `${e.time}${e.endTime ? ` to ${e.endTime}` : ""}` : "All day"}
                    </div>
                    <div className="min-w-0 flex-1 text-[16px] leading-snug text-[var(--tk-charcoal)]">{e.title}</div>
                    {e.pax !== null && (
                      <div className="flex shrink-0 items-center gap-1 text-[14px] font-semibold text-[var(--tk-ink-soft)]">
                        <Users className="h-4 w-4" /> {e.pax}
                      </div>
                    )}
                    {e.tbc && (
                      <div
                        className="shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold"
                        style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
                      >
                        TBC, not locked in
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
        <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-mute)]">
          Updates itself every hour from the hello@ inbox and Now Book It. To change a booking, change it there, not here.
        </p>
      </div>
    </div>
  )
}
