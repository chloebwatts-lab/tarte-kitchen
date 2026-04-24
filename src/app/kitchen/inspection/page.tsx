export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import {
  listCoolingLogsForInspection,
  type CoolingLogRecord,
} from "@/lib/actions/cooling"
import {
  listPastryRotationForInspection,
  BAKE_LABEL,
  type InspectionPastryRow,
} from "@/lib/actions/pastry-rotation"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { InspectionPrintButton } from "@/components/kitchen/InspectionPrintButton"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import { Venue } from "@/generated/prisma"

type SingleVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
type VenueFilter = SingleVenue | "ALL"

function isVenue(v: string | null): v is SingleVenue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

const RANGE_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
]

function formatAest(d: Date | string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(d).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    ...opts,
  })
}

function dayKey(d: Date | string) {
  return formatAest(d, { year: "numeric", month: "2-digit", day: "2-digit" })
}

export default async function InspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  const venueFilter: VenueFilter = isVenue(venueParam)
    ? venueParam
    : venueParam === "ALL"
      ? "ALL"
      : "BURLEIGH"
  const rangeDays =
    typeof sp.days === "string" && /^\d+$/.test(sp.days)
      ? Math.min(365, Number(sp.days))
      : 30
  const fromDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)

  const [coolingLogs, pastryRows, checklistRuns] = await Promise.all([
    listCoolingLogsForInspection({ venue: venueFilter, fromDate }),
    listPastryRotationForInspection({ venue: venueFilter, fromDate }),
    db.checklistRun.findMany({
      where: {
        runDate: { gte: fromDate },
        ...(venueFilter !== "ALL"
          ? { venue: venueFilter as Venue }
          : { venue: { in: [...SINGLE_VENUES] as Venue[] } }),
      },
      include: {
        template: { select: { name: true, area: true, isFoodSafety: true } },
        items: {
          select: {
            id: true,
            checkedAt: true,
            checkedBy: true,
            tempCelsius: true,
            note: true,
            templateItem: { select: { label: true, requireTemp: true } },
          },
        },
        photos: { select: { id: true, url: true } },
      },
      orderBy: [{ runDate: "desc" }, { createdAt: "desc" }],
      take: 500,
    }),
  ])

  // Group cooling, checklist runs, and pastry rows by day
  const days = new Map<
    string,
    {
      label: string
      cooling: CoolingLogRecord[]
      runs: typeof checklistRuns
      pastry: InspectionPastryRow[]
    }
  >()
  const ensureDay = (sourceDate: Date | string) => {
    const k = dayKey(sourceDate)
    let d = days.get(k)
    if (!d) {
      d = {
        label: formatAest(sourceDate, {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }),
        cooling: [],
        runs: [],
        pastry: [],
      }
      days.set(k, d)
    }
    return d
  }
  for (const c of coolingLogs) ensureDay(c.startedAt).cooling.push(c)
  for (const r of checklistRuns) ensureDay(r.runDate).runs.push(r)
  for (const p of pastryRows) ensureDay(`${p.date}T00:00:00`).pastry.push(p)
  const orderedDays = Array.from(days.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  )

  const venueForCrumb = venueFilter === "ALL" ? "BURLEIGH" : venueFilter
  const venueLabel =
    venueFilter === "ALL"
      ? "All venues"
      : VENUE_LABEL[venueFilter].replace(/\s*\(.*\)$/, "")
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="min-w-0 flex-1">
          <KitchenBreadcrumb
            crumbs={[
              { label: "Venues", href: "/kitchen" },
              { label: venueLabel, href: `/kitchen?venue=${venueForCrumb}` },
              { label: "Inspection view" },
            ]}
          />
        </div>
        <div className="shrink-0">
          <InspectionPrintButton />
        </div>
      </div>

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Inspection view
        </div>
        <p className="mt-2 max-w-2xl text-[16px] leading-snug text-[var(--tk-ink-soft)]">
          Read-only record of food safety activity. Hand the iPad to the
          inspector or hit print for a paper copy.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <FilterGroup label="Venue">
          <FilterPill
            href={`?venue=ALL&days=${rangeDays}`}
            active={venueFilter === "ALL"}
          >
            All
          </FilterPill>
          {SINGLE_VENUES.map((v) => (
            <FilterPill
              key={v}
              href={`?venue=${v}&days=${rangeDays}`}
              active={venueFilter === v}
            >
              {VENUE_LABEL[v]}
            </FilterPill>
          ))}
        </FilterGroup>
        <FilterGroup label="Range">
          {RANGE_OPTIONS.map((r) => (
            <FilterPill
              key={r.value}
              href={`?venue=${venueFilter}&days=${r.value}`}
              active={rangeDays === r.value}
            >
              Last {r.label}
            </FilterPill>
          ))}
        </FilterGroup>
      </div>

      <div className="rounded-[12px] border border-[var(--tk-line)] bg-white px-5 py-3 text-[13px] text-[var(--tk-ink-soft)] print:border-black">
        <strong className="text-[var(--tk-charcoal)]">
          {venueFilter === "ALL" ? "All venues" : VENUE_LABEL[venueFilter]}
        </strong>{" "}
        · last {rangeDays} days · {coolingLogs.length} cooling logs ·{" "}
        {checklistRuns.length} checklist runs · {pastryRows.length} pastry
        entries
      </div>

      {orderedDays.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-12 text-center text-[14px] text-[var(--tk-ink-soft)]">
          No records in this range.
        </div>
      ) : (
        orderedDays.map(([key, d]) => (
          <DayBlock
            key={key}
            label={d.label}
            cooling={d.cooling}
            runs={d.runs}
            pastry={d.pastry}
            showVenue={venueFilter === "ALL"}
          />
        ))
      )}
    </div>
  )
}

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1.5 ring-1 ring-[var(--tk-line)]">
      <span
        className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-mute)]"
        style={{ letterSpacing: "0.1em" }}
      >
        {label}
      </span>
      {children}
    </div>
  )
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="rounded-full px-3 py-1 text-[13px] font-semibold transition"
      style={{
        background: active ? "var(--tk-charcoal)" : "transparent",
        color: active ? "#fff" : "var(--tk-ink-soft)",
      }}
    >
      {children}
    </Link>
  )
}

type InspectionRun = {
  id: string
  venue: Venue
  runDate: Date
  shift: string
  status: string
  completedBy: string | null
  template: { name: string; area: string | null; isFoodSafety: boolean }
  items: {
    id: string
    checkedAt: Date | null
    checkedBy: string | null
    tempCelsius: unknown
    note: string | null
    templateItem: { label: string; requireTemp: boolean }
  }[]
  photos: { id: string; url: string }[]
}

function DayBlock({
  label,
  cooling,
  runs,
  pastry,
  showVenue,
}: {
  label: string
  cooling: CoolingLogRecord[]
  runs: InspectionRun[]
  pastry: InspectionPastryRow[]
  showVenue: boolean
}) {
  return (
    <section className="space-y-3">
      <div
        className="tk-display border-b border-[var(--tk-line)] pb-2 leading-none text-[var(--tk-charcoal)] print:border-black"
        style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}
      >
        {label}
      </div>

      {cooling.length > 0 && (
        <div>
          <div
            className="tk-caps mb-2"
            style={{ color: "var(--tk-ink-mute)", fontSize: 11 }}
          >
            Cooling logs
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[var(--tk-line)] bg-white print:border-black">
            <table className="w-full text-[13px]">
              <thead>
                <tr
                  className="text-left text-[11px] uppercase tracking-wider text-[var(--tk-ink-mute)]"
                  style={{ background: "var(--tk-bg)" }}
                >
                  {showVenue && <th className="px-3 py-2 font-semibold">Venue</th>}
                  <th className="px-3 py-2 font-semibold">Item</th>
                  <th className="px-3 py-2 font-semibold">Started</th>
                  <th className="px-3 py-2 font-semibold tabular-nums">Start</th>
                  <th className="px-3 py-2 font-semibold tabular-nums">2hr</th>
                  <th className="px-3 py-2 font-semibold tabular-nums">6hr</th>
                  <th className="px-3 py-2 font-semibold tabular-nums">Fridge</th>
                  <th className="px-3 py-2 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {cooling.map((c) => {
                  const twoFail = c.twoHourTempC !== null && c.twoHourTempC > 21
                  const sixFail = c.sixHourTempC !== null && c.sixHourTempC > 5
                  return (
                    <tr
                      key={c.id}
                      className="border-t border-[var(--tk-line)] align-top"
                    >
                      {showVenue && (
                        <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                          {VENUE_LABEL[c.venue as SingleVenue] ?? c.venue}
                        </td>
                      )}
                      <td className="px-3 py-2 font-semibold text-[var(--tk-charcoal)]">
                        {c.itemName}
                        {c.batchSize && (
                          <span className="ml-1 font-normal text-[var(--tk-ink-soft)]">
                            · {c.batchSize}
                          </span>
                        )}
                        {c.notes && (
                          <div className="mt-0.5 text-[12px] font-normal text-[var(--tk-ink-soft)]">
                            {c.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                        {formatAest(c.startedAt, {
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--tk-ink)]">
                        {c.startTempC ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2 tabular-nums"
                        style={{
                          color: twoFail ? "var(--tk-warn)" : "var(--tk-ink)",
                          fontWeight: twoFail ? 600 : 400,
                        }}
                      >
                        {c.twoHourTempC ?? "—"}
                      </td>
                      <td
                        className="px-3 py-2 tabular-nums"
                        style={{
                          color: sixFail ? "var(--tk-warn)" : "var(--tk-ink)",
                          fontWeight: sixFail ? 600 : 400,
                        }}
                      >
                        {c.sixHourTempC ?? "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums text-[var(--tk-ink-soft)]">
                        {c.fridgeTempC ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                        {c.staffInitials}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {runs.length > 0 && (
        <div>
          <div
            className="tk-caps mb-2"
            style={{ color: "var(--tk-ink-mute)", fontSize: 11 }}
          >
            Checklists
          </div>
          <div className="space-y-2">
            {runs.map((r) => {
              const totalItems = r.items.length
              const checkedItems = r.items.filter((i) => i.checkedAt).length
              const tempItems = r.items.filter(
                (i) => i.templateItem.requireTemp && i.tempCelsius !== null
              )
              return (
                <div
                  key={r.id}
                  className="rounded-[12px] border border-[var(--tk-line)] bg-white px-4 py-3 print:border-black"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div className="font-semibold text-[var(--tk-charcoal)]">
                      {r.template.name}
                      {r.template.area && (
                        <span className="ml-2 text-[12px] font-normal text-[var(--tk-ink-soft)]">
                          {r.template.area}
                        </span>
                      )}
                    </div>
                    <div className="text-[12px] text-[var(--tk-ink-soft)]">
                      {showVenue && (
                        <span>{VENUE_LABEL[r.venue as SingleVenue] ?? r.venue} · </span>
                      )}
                      {r.shift.toLowerCase()} shift · {checkedItems}/{totalItems}{" "}
                      items · {r.status.toLowerCase()}
                      {r.completedBy && ` · by ${r.completedBy}`}
                    </div>
                  </div>
                  {tempItems.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {tempItems.map((it) => (
                        <span
                          key={it.id}
                          className="rounded-full bg-[var(--tk-bg)] px-2.5 py-0.5 text-[11px] tabular-nums text-[var(--tk-ink-soft)]"
                        >
                          {it.templateItem.label}: {String(it.tempCelsius)}°C
                        </span>
                      ))}
                    </div>
                  )}
                  {r.photos.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.photos.map((p) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={p.id}
                          src={p.url}
                          alt=""
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pastry.length > 0 && (
        <div>
          <div
            className="tk-caps mb-2"
            style={{ color: "var(--tk-ink-mute)", fontSize: 11 }}
          >
            Pastry rotation
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[var(--tk-line)] bg-white print:border-black">
            <table className="w-full text-[13px]">
              <thead>
                <tr
                  className="text-left text-[11px] uppercase tracking-wider text-[var(--tk-ink-mute)]"
                  style={{ background: "var(--tk-bg)" }}
                >
                  {showVenue && <th className="px-3 py-2 font-semibold">Venue</th>}
                  <th className="px-3 py-2 font-semibold">Product</th>
                  <th className="px-3 py-2 font-semibold">Bake</th>
                  <th className="px-3 py-2 text-right font-semibold tabular-nums">Prepared</th>
                  <th className="px-3 py-2 text-right font-semibold tabular-nums">Sold</th>
                  <th className="px-3 py-2 text-right font-semibold tabular-nums">Discarded</th>
                  <th className="px-3 py-2 font-semibold">By</th>
                </tr>
              </thead>
              <tbody>
                {pastry.map((p, i) => (
                  <tr
                    key={i}
                    className="border-t border-[var(--tk-line)] align-top"
                  >
                    {showVenue && (
                      <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                        {VENUE_LABEL[p.venue as SingleVenue] ?? p.venue}
                      </td>
                    )}
                    <td className="px-3 py-2 font-semibold text-[var(--tk-charcoal)]">
                      {p.productName}
                    </td>
                    <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                      {BAKE_LABEL[p.bakeTime]}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {p.prepared}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{ color: "var(--tk-done)" }}
                    >
                      {p.sold}
                    </td>
                    <td
                      className="px-3 py-2 text-right tabular-nums"
                      style={{
                        color: p.discarded > 0 ? "var(--tk-warn)" : "var(--tk-ink)",
                        fontWeight: p.discarded > 0 ? 600 : 400,
                      }}
                    >
                      {p.discarded}
                    </td>
                    <td className="px-3 py-2 text-[var(--tk-ink-soft)]">
                      {p.staffName ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
