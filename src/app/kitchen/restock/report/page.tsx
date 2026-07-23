export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Star } from "lucide-react"
import { getRestockReport } from "@/lib/actions/restock"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { VENUE_LABEL } from "@/lib/venues"
import { STATION_LABEL } from "@/lib/stations"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"

function isVenue(v: string | null): v is Venue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split("T")[0]
}

export default async function RestockReportPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venue: Venue = isVenue(venueParam) ? venueParam : "BEACH_HOUSE"
  const dateParam =
    typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : undefined

  const report = await getRestockReport({ venue, date: dateParam })
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const human = new Date(report.date).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })

  return (
    <div className="space-y-6">
      <KitchenBreadcrumb
        crumbs={[
          { label: "Venues", href: "/kitchen" },
          { label: venueLabel, href: `/kitchen?venue=${venue}` },
          { label: "Restock & prep", href: `/kitchen/restock?venue=${venue}` },
          { label: "Daily report" },
        ]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4 px-1">
        <div>
          <div
            className="tk-display leading-none text-[var(--tk-charcoal)]"
            style={{ fontSize: 40, fontWeight: 700, letterSpacing: "-0.025em" }}
          >
            Daily prep stock report
          </div>
          <p className="mt-2 text-[16px] text-[var(--tk-ink-soft)]">
            {venueLabel} · counts taken {human}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/kitchen/restock/report?venue=${venue}&date=${shiftDate(report.date, -1)}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-bg)]"
            aria-label="Previous day"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <Link
            href={`/kitchen/restock/report?venue=${venue}&date=${shiftDate(report.date, 1)}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-[var(--tk-line)] bg-white text-[var(--tk-ink-soft)] transition hover:bg-[var(--tk-bg)]"
            aria-label="Next day"
          >
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid gap-3 sm:grid-cols-3">
        <ReportStat label="Items counted" value={report.totals.itemsCounted} />
        <ReportStat label="Items requested" value={report.totals.itemsRequested} />
        <ReportStat
          label="Shortfalls"
          value={report.totals.shortfalls.length}
          warn={report.totals.shortfalls.length > 0}
        />
      </div>

      {report.missingStations.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-[16px] px-5 py-4 text-[14px] font-medium"
          style={{ background: "var(--tk-gold-soft)", color: "#8a6d1f" }}
        >
          <AlertTriangle className="h-5 w-5 shrink-0" />
          No count submitted for:{" "}
          {report.missingStations.map((s) => STATION_LABEL[s]).join(", ")}
        </div>
      )}

      {report.totals.shortfalls.length > 0 && (
        <div className="rounded-[18px] border border-[var(--tk-line)] bg-white p-5">
          <div className="tk-caps mb-3" style={{ color: "#b3261e" }}>
            Shortfalls — requested but not fully supplied
          </div>
          <ul className="space-y-1.5">
            {report.totals.shortfalls.map((s, i) => (
              <li
                key={`${s.name}-${s.station}-${i}`}
                className="flex items-center justify-between gap-3 text-[15px]"
              >
                <span className="text-[var(--tk-charcoal)]">
                  {s.name}{" "}
                  <span className="text-[13px] text-[var(--tk-ink-soft)]">
                    · {STATION_LABEL[s.station]}
                  </span>
                </span>
                <span className="tabular-nums text-[var(--tk-ink-soft)]">
                  {s.supplied ?? 0} of {s.requested}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.sheets.length === 0 ? (
        <div className="rounded-[24px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center text-[14px] text-[var(--tk-ink-soft)]">
          No counts were taken on this date.
        </div>
      ) : (
        report.sheets.map((sheet) => (
          <div
            key={sheet.sheetId}
            className="overflow-hidden rounded-[18px] border border-[var(--tk-line)] bg-white"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--tk-line)] bg-[var(--tk-bg)] px-5 py-3.5">
              <div className="text-[16px] font-semibold text-[var(--tk-charcoal)]">
                {STATION_LABEL[sheet.station]}
              </div>
              <div className="text-[13px] text-[var(--tk-ink-soft)]">
                {sheet.countedBy ? `Counted by ${sheet.countedBy}` : "Unsigned"}
                {sheet.restockedBy
                  ? ` · restocked by ${sheet.restockedBy}`
                  : sheet.status === "SUBMITTED"
                    ? " · awaiting restock"
                    : sheet.status === "IN_PROGRESS"
                      ? " · count in progress"
                      : ""}
              </div>
            </div>
            {sheet.notes && (
              <div className="border-b border-[var(--tk-line)] px-5 py-3 text-[14px] italic text-[var(--tk-ink-soft)]">
                “{sheet.notes}”
              </div>
            )}
            {sheet.lines.length === 0 ? (
              <div className="px-5 py-6 text-[14px] text-[var(--tk-ink-soft)]">
                Nothing counted or requested on this sheet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-soft)]">
                      <th className="px-5 py-2.5">Item</th>
                      <th className="px-3 py-2.5 text-right">Coolroom at close</th>
                      <th className="px-3 py-2.5 text-right">Requested</th>
                      <th className="px-3 py-2.5 text-right">Supplied</th>
                      <th className="px-5 py-2.5">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.lines.map((l, i) => {
                      const short =
                        (l.requested ?? 0) > 0 &&
                        sheet.status === "RESTOCKED" &&
                        (l.supplied == null || l.supplied < l.requested!)
                      const fully =
                        (l.requested ?? 0) > 0 &&
                        l.supplied != null &&
                        l.supplied >= l.requested!
                      return (
                        <tr
                          key={`${l.name}-${i}`}
                          className="border-t border-[var(--tk-line)]"
                        >
                          <td className="px-5 py-2.5 text-[var(--tk-charcoal)]">
                            <span className="inline-flex items-center gap-1.5">
                              {l.priorityRank != null ? (
                                <span
                                  className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
                                  style={{ background: "var(--tk-gold)", color: "#5d4a12" }}
                                >
                                  {l.priorityRank}
                                </span>
                              ) : l.priority ? (
                                <Star
                                  className="h-3.5 w-3.5"
                                  fill="var(--tk-gold)"
                                  stroke="var(--tk-gold)"
                                />
                              ) : null}
                              {l.name}
                              {l.unit && (
                                <span className="text-[12px] text-[var(--tk-ink-soft)]">
                                  {l.unit}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-[var(--tk-ink-soft)]">
                            {l.available ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-medium text-[var(--tk-charcoal)]">
                            {l.requested ?? "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            {short ? (
                              <span
                                className="font-semibold"
                                style={{ color: "#b3261e" }}
                              >
                                {l.supplied ?? 0}
                              </span>
                            ) : fully ? (
                              <span className="inline-flex items-center gap-1 font-medium text-[var(--tk-done)]">
                                <Check className="h-3.5 w-3.5" />
                                {l.supplied}
                              </span>
                            ) : (
                              <span className="text-[var(--tk-ink-soft)]">
                                {l.supplied ?? "—"}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-2.5 text-[13px] italic text-[var(--tk-ink-soft)]">
                            {l.note ?? ""}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  )
}

function ReportStat({
  label,
  value,
  warn,
}: {
  label: string
  value: number
  warn?: boolean
}) {
  return (
    <div className="rounded-[16px] border border-[var(--tk-line)] bg-white p-4">
      <div className="text-[12px] font-medium uppercase tracking-widest text-[var(--tk-ink-soft)]">
        {label}
      </div>
      <div
        className="mt-1 tabular-nums"
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: "-0.02em",
          color: warn ? "#b3261e" : "var(--tk-charcoal)",
        }}
      >
        {value}
      </div>
    </div>
  )
}
