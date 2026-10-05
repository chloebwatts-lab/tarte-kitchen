export const dynamic = "force-dynamic"

import Link from "next/link"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { HighTeaCheck } from "@/components/kitchen/HighTeaCheck"
import { getHighTeaDay, snapshotsFor } from "@/lib/high-tea/data"
import { STAGES, brisbaneDay, changesSince, longDay, niceTime, signed } from "@/lib/high-tea/prep"

const DAYS_SHOWN = 6

function chipLabel(day: string, i: number): string {
  if (i === 0) return "Today"
  if (i === 1) return "Tomorrow"
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", timeZone: "UTC" })
}

export default async function HighTeaPrepPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const days = Array.from({ length: DAYS_SHOWN }, (_, i) => brisbaneDay(i))
  const dayParam = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null
  // Tomorrow is the day this page is mostly opened for: the day-before calls.
  const day = dayParam ?? days[1]

  const [d, snaps] = await Promise.all([getHighTeaDay(day), snapshotsFor(day)])
  const last = snaps[snaps.length - 1] ?? null
  const changes = last ? changesSince(last.items, d.lines.map((l) => ({ name: l.name, total: l.total }))) : []
  const delta = new Map(changes.map((c) => [c.name, c.delta]))

  const tile = (label: string, value: number, sub?: string, warn = false) => (
    <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4">
      <div className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>{label}</div>
      <div
        className="tk-display mt-1 leading-none"
        style={{ fontSize: 40, fontWeight: 700, color: warn && value > 0 ? "#8a6d1f" : "var(--tk-charcoal)" }}
      >
        {value}
      </div>
      {sub && <div className="mt-1 text-[13px] text-[var(--tk-ink-soft)]">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-8">
      <KitchenBreadcrumb crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: "High tea prep" }]} />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          High tea prep
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Tea Garden pastry, worked out from the high tea bookings plus {d.extra} extra of each for walk-ins
          {d.weekend ? " (weekend)" : " (weekday)"}. Ring each booking the day before and tick who is having the full high tea.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {days.map((x, i) => (
            <Link
              key={x}
              href={`/kitchen/high-tea?day=${x}`}
              className={`rounded-full px-4 py-2 text-[14px] font-semibold transition ${
                x === day ? "bg-[var(--tk-charcoal)] text-white" : "border border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)]"
              }`}
            >
              {chipLabel(x, i)}
            </Link>
          ))}
        </div>
      </div>

      <div>
        <div className="tk-caps mb-3 px-1" style={{ color: "var(--tk-ink-mute)" }}>{longDay(day)}</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tile("Guests having high tea", d.guests, d.guests !== d.bookedGuests ? `${d.bookedGuests} booked` : undefined)}
          {tile("Unconfirmed guests", d.unconfirmedGuests, "Booking not confirmed in Now Book It", true)}
          {tile("Bookings still to ring", d.uncheckedBookings, "Full high tea or not", true)}
        </div>
      </div>

      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>Pastry to make</div>
        <div className="overflow-hidden rounded-[16px] border border-[var(--tk-line)] bg-white">
          {d.lines.length === 0 ? (
            <div className="px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
              The stand items have not been loaded yet, so there are no amounts. Guest numbers and bookings are live.
            </div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="tk-caps" style={{ color: "var(--tk-ink-mute)" }}>
                  <th className="px-5 py-3 font-semibold">Item</th>
                  <th className="px-3 py-3 text-right font-semibold">Bookings</th>
                  <th className="px-3 py-3 text-right font-semibold">Extra</th>
                  <th className="px-5 py-3 text-right font-semibold">Make</th>
                </tr>
              </thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.name} className="border-t border-[var(--tk-line)]">
                    <td className="px-5 py-3 text-[16px] font-semibold text-[var(--tk-charcoal)]">{l.name}</td>
                    <td className="px-3 py-3 text-right text-[15px] tabular-nums text-[var(--tk-ink-soft)]">{l.forBookings}</td>
                    <td className="px-3 py-3 text-right text-[15px] tabular-nums text-[var(--tk-ink-soft)]">+{l.extra}</td>
                    <td className="px-5 py-3 text-right text-[20px] font-bold tabular-nums text-[var(--tk-charcoal)]">
                      {l.total}
                      {delta.get(l.name) ? (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 align-middle text-[12px] font-semibold"
                          style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
                        >
                          {signed(delta.get(l.name)!)}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {last && d.lines.length > 0 && (
          <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-mute)]">
            {changes.length
              ? `Gold numbers are the change since the ${STAGES[last.stage].label.toLowerCase()} was emailed (${STAGES[last.stage].out}).`
              : `Same as the ${STAGES[last.stage].label.toLowerCase()} that was emailed (${STAGES[last.stage].out}).`}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="tk-caps px-1" style={{ color: "var(--tk-ink-mute)" }}>
          Bookings: full high tea or not
        </div>
        {d.bookings.length === 0 ? (
          <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">
            No high tea bookings for this day.
          </div>
        ) : (
          d.bookings.map((b) => (
            <div key={b.ref} className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <div className="text-[14px] font-semibold tabular-nums text-[var(--tk-ink-soft)]">{niceTime(b.time)}</div>
                <div className="text-[18px] font-semibold text-[var(--tk-charcoal)]">{b.name}</div>
                <div className="text-[15px] text-[var(--tk-ink-soft)]">{b.pax} guest{b.pax === 1 ? "" : "s"}</div>
                {b.unconfirmed && (
                  <span className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold" style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}>
                    Unconfirmed booking
                  </span>
                )}
              </div>
              {(b.tags || b.notes) && (
                <div className="mt-1.5 max-w-3xl text-[14px] leading-snug text-[var(--tk-ink-soft)]">
                  {[b.tags, b.notes].filter(Boolean).join(". ")}
                </div>
              )}
              <div className="mt-3">
                <HighTeaCheck bookingRef={b.ref} pax={b.pax} highTeaPax={b.highTeaPax} checked={b.checked} />
              </div>
            </div>
          ))
        )}
        <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-mute)]">
          Not ticked means the list counts everyone on the booking. Emails go to hello@ and Shawna 48 hours out, 24 hours out and 12 hours out.
        </p>
      </div>
    </div>
  )
}
