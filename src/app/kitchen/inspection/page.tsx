export const dynamic = "force-dynamic"

import Link from "next/link"
import { db } from "@/lib/db"
import {
  listCoolingLogsForInspection,
  type CoolingLogRecord,
} from "@/lib/actions/cooling"
import {
  listPastryRotationForInspection,
  type InspectionPastryRow,
} from "@/lib/actions/pastry-rotation"
import { BAKE_LABEL } from "@/lib/pastry-rotation-constants"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { RefreshOnResume } from "@/components/kitchen/RefreshOnResume"
import { InspectionPrintButton } from "@/components/kitchen/InspectionPrintButton"
import { InspectionChecklistCard } from "@/components/kitchen/InspectionChecklistCard"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import { Venue } from "@/generated/prisma/client"

type SingleVenue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
type VenueFilter = SingleVenue | "ALL"

function isVenue(v: string | null): v is SingleVenue {
  return v === "BURLEIGH" || v === "BEACH_HOUSE" || v === "TEA_GARDEN"
}

const RANGE_OPTIONS: { value: number; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
]

function formatAest(d: Date | string, opts: Intl.DateTimeFormatOptions = {}) {
  return new Date(d).toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    ...opts,
  })
}

function dayKey(d: Date | string) {
  // ISO yyyy-mm-dd (en-CA) so the descending sort is chronological. The
  // previous dd/mm/yyyy key sorted as a STRING: "31/07" ranked above
  // "05/08", so once the month ticked over every August day sank below
  // late July, the whole view looked like it ended on the 31st.
  return new Date(d).toLocaleDateString("en-CA", {
    timeZone: "Australia/Brisbane",
  })
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
      : 14
  const fromDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000)

  const [coolingLogs, pastryRows, checklistRuns, councilDocs] = await Promise.all([
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
      take: 1500,
    }),
    // Licence + FSS evidence so the inspector sees them HERE, not only in
    // the council folder.
    db.councilDocument.findMany({
      where: {
        type: { in: ["FOOD_BUSINESS_LICENCE", "FSS_CERTIFICATE", "FSS_NOTIFICATION"] },
        ...(venueFilter !== "ALL" ? { venue: venueFilter as Venue } : {}),
      },
      select: {
        id: true, venue: true, type: true, title: true, description: true,
        issuedOn: true, expiresOn: true,
      },
      orderBy: [{ type: "asc" }, { title: "asc" }],
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
  for (const p of pastryRows) ensureDay(`${p.date}T00:00:00.000Z`).pastry.push(p)
  const orderedDays = Array.from(days.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  )

  // ── at-a-glance summary numbers ───────────────────────────────────────
  const todayKey = dayKey(new Date())
  const latestChecklist = checklistRuns[0]?.runDate ?? null
  const latestCooling = coolingLogs.reduce<Date | null>(
    (m, c) => (!m || new Date(c.startedAt) > m ? new Date(c.startedAt) : m),
    null
  )
  const latestPastry = pastryRows.reduce<string | null>(
    (m, p) => (!m || p.date > m ? p.date : m),
    null
  )
  const pastryDiscarded = pastryRows.reduce((s, p) => s + p.discarded, 0)
  // Count notes describing an ACTION taken, not routine all-clears ("No
  // activity", "All labelled, FIFO OK" are fine and vastly outnumber real
  // corrective notes, matching keywords beats maintaining a whitelist).
  const CORRECTIVE = /discard|binned|reheat|re-?check|door|thermostat|compressor|seal|bait|maintenance|pulled|moved|adjusted|defrost|monitor|blast chiller|notified/i
  const flaggedItems = checklistRuns.reduce(
    (s, r) => s + r.items.filter((i) => i.note && CORRECTIVE.test(i.note)).length,
    0
  )
  const checklistCurrent = latestChecklist ? dayKey(latestChecklist) === todayKey : false
  const licenceDocs = councilDocs.filter((d) => d.type === "FOOD_BUSINESS_LICENCE")
  const fssDocs = councilDocs.filter((d) => d.type !== "FOOD_BUSINESS_LICENCE")

  const venueLabel =
    venueFilter === "ALL"
      ? "All venues"
      : VENUE_LABEL[venueFilter].replace(/\s*\(.*\)$/, "")
  // On "All venues" the middle crumb should return to the venue picker
  // (/kitchen with no param), not silently drop into Burleigh's checklists.
  const venueCrumbHref =
    venueFilter === "ALL" ? "/kitchen" : `/kitchen?venue=${venueFilter}`
  return (
    <div className="space-y-6">
      <RefreshOnResume />
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="min-w-0 flex-1">
          <KitchenBreadcrumb
            crumbs={[
              { label: "Venues", href: "/kitchen" },
              { label: venueLabel, href: venueCrumbHref },
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
          Read-only record of food safety activity. Hand the iPad or phone to
          the inspector, the summary tells the story, each day expands for
          detail.
        </p>
      </div>

      {/* Documents & FSS, the folder the EHO asks for first */}
      <Link
        href={
          venueFilter === "ALL" ? "/council" : `/council/${venueFilter}`
        }
        className="flex items-center justify-between gap-4 rounded-[16px] border border-[var(--tk-line)] bg-[var(--tk-charcoal)] px-5 py-4 text-white transition active:scale-[0.995] print:hidden"
      >
        <div>
          <div className="text-[17px] font-semibold leading-tight">
            Council documents folder
          </div>
          <div className="mt-0.5 text-[13px] leading-snug text-white/70">
            Licence, FSS certificates, pest control, training, calibration,
            all printable.
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/15 px-3.5 py-1.5 text-[13px] font-semibold">
          Open →
        </span>
      </Link>

      {/* At-a-glance summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryTile
          label="Checklists"
          value={String(checklistRuns.length)}
          note={
            latestChecklist
              ? `latest ${formatAest(latestChecklist, { day: "numeric", month: "short" })}${checklistCurrent ? " · today" : ""}`
              : "no records in range"
          }
          ok={checklistCurrent}
        />
        <SummaryTile
          label="Cooling logs"
          value={String(coolingLogs.length)}
          note={
            latestCooling
              ? `latest ${formatAest(latestCooling, { day: "numeric", month: "short" })}`
              : "no records in range"
          }
          ok={latestCooling !== null}
        />
        <SummaryTile
          label="Pastry entries"
          value={String(pastryRows.length)}
          note={
            latestPastry
              ? `latest ${formatAest(`${latestPastry}T00:00:00`, { day: "numeric", month: "short" })} · ${pastryDiscarded} discarded`
              : "no records in range"
          }
          ok={latestPastry !== null}
        />
        <SummaryTile
          label="Corrective notes"
          value={String(flaggedItems)}
          note={`in last ${rangeDays} days`}
          ok={true}
        />
      </div>

      {/* Licence + FSS evidence inline */}
      {(licenceDocs.length > 0 || fssDocs.length > 0) && (
        <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4">
          <div
            className="tk-caps mb-3"
            style={{ color: "var(--tk-ink-mute)", fontSize: 11 }}
          >
            Licence &amp; Food Safety Supervisors
          </div>
          <ul className="space-y-2">
            {[...licenceDocs, ...fssDocs].map((d) => (
              <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                <a
                  href={`/api/council/document/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[var(--tk-charcoal)] underline decoration-[var(--tk-line)] underline-offset-2"
                >
                  {d.title}
                </a>
                {d.expiresOn && (
                  <span className="text-[12px] text-[var(--tk-ink-soft)]">
                    valid to {formatAest(d.expiresOn, { day: "numeric", month: "short", year: "numeric" })}
                  </span>
                )}
                {venueFilter === "ALL" && (
                  <span className="text-[12px] text-[var(--tk-ink-mute)]">
                    {VENUE_LABEL[d.venue as SingleVenue] ?? d.venue}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
        orderedDays.map(([key, d], idx) => (
          <details
            key={key}
            open={idx === 0}
            className="group rounded-[16px] border border-[var(--tk-line)] bg-white print:border-0 print:[&[open]]:block"
          >
            <summary
              className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden"
            >
              <span
                className="tk-display leading-none text-[var(--tk-charcoal)]"
                style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                {d.label}
              </span>
              <span className="text-[13px] tabular-nums text-[var(--tk-ink-soft)]">
                {d.runs.length} checklists · {d.cooling.length} cooling ·{" "}
                {d.pastry.length} pastry
                <span className="ml-2 text-[var(--tk-ink-mute)] transition group-open:hidden">
                  tap to expand
                </span>
              </span>
            </summary>
            <div className="border-t border-[var(--tk-line)] px-5 py-4">
              <DayBlock
                label=""
                cooling={d.cooling}
                runs={d.runs}
                pastry={d.pastry}
                showVenue={venueFilter === "ALL"}
              />
            </div>
          </details>
        ))
      )}
    </div>
  )
}

function SummaryTile({
  label,
  value,
  note,
  ok,
}: {
  label: string
  value: string
  note: string
  ok: boolean
}) {
  return (
    <div className="rounded-[16px] border border-[var(--tk-line)] bg-white px-4 py-3">
      <div
        className="tk-caps"
        style={{ color: "var(--tk-ink-mute)", fontSize: 11 }}
      >
        {label}
      </div>
      <div
        className="tk-display mt-1 leading-none tabular-nums"
        style={{
          fontSize: 28,
          fontWeight: 700,
          color: ok ? "var(--tk-charcoal)" : "var(--tk-warn)",
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] leading-snug text-[var(--tk-ink-soft)]">
        {note}
      </div>
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
      {label !== "" && (
        <div
          className="tk-display border-b border-[var(--tk-line)] pb-2 leading-none text-[var(--tk-charcoal)] print:border-black"
          style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em" }}
        >
          {label}
        </div>
      )}

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
              return (
                <div key={r.id} className="space-y-2">
                  <InspectionChecklistCard
                    templateName={r.template.name}
                    area={r.template.area}
                    venueLabel={
                      showVenue
                        ? (VENUE_LABEL[r.venue as SingleVenue] ?? r.venue)
                        : null
                    }
                    shift={r.shift}
                    status={r.status}
                    completedBy={r.completedBy}
                    checkedItems={checkedItems}
                    totalItems={totalItems}
                    items={r.items.map((it) => ({
                      id: it.id,
                      label: it.templateItem.label,
                      requireTemp: it.templateItem.requireTemp,
                      tempCelsius:
                        it.tempCelsius !== null && it.tempCelsius !== undefined
                          ? String(it.tempCelsius)
                          : null,
                      note: it.note,
                      checkedBy: it.checkedBy,
                      checkedTime: it.checkedAt
                        ? formatAest(it.checkedAt, {
                            hour: "numeric",
                            minute: "2-digit",
                            hour12: true,
                          })
                        : null,
                      checked: it.checkedAt !== null,
                    }))}
                  />
                  {r.photos.length > 0 && (
                    <div className="flex flex-wrap gap-2 px-1">
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
        <details className="group/pastry print:[&[open]]:block">
          <summary className="mb-2 flex cursor-pointer list-none flex-wrap items-baseline gap-x-3 [&::-webkit-details-marker]:hidden">
            <span
              className="tk-caps"
              style={{ color: "var(--tk-ink-mute)", fontSize: 11 }}
            >
              Pastry rotation
            </span>
            <span className="text-[13px] tabular-nums text-[var(--tk-ink-soft)]">
              {pastry.reduce((s, p) => s + p.prepared, 0)} baked ·{" "}
              {pastry.reduce((s, p) => s + p.sold, 0)} sold ·{" "}
              {pastry.reduce((s, p) => s + p.discarded, 0)} discarded
              <span className="ml-2 text-[var(--tk-ink-mute)] group-open/pastry:hidden">
                tap for line detail
              </span>
            </span>
          </summary>
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
        </details>
      )}
    </section>
  )
}
