export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  ChevronLeft,
  Croissant,
  Snowflake,
  SprayCan,
  Thermometer,
} from "lucide-react"
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
import { VENUE_LABEL, VENUE_SHORT_LABEL, SINGLE_VENUES } from "@/lib/venues"
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
  { value: 90, label: "90 days" },
]

/**
 * The registers an EHO actually asks for, one box each. The inspector
 * picks a category first, then the date range; nothing bulk-loads.
 */
const SECTIONS = {
  cleaning: {
    title: "Cleaning checklists",
    blurb: "Opening, during-service and close-down cleaning, signed per item.",
  },
  "food-temps": {
    title: "Food temperature logs",
    blurb: "Fridge, freezer and hot-hold readings through the day.",
  },
  cooling: {
    title: "Cooling log",
    blurb: "Per-batch HACCP cooling: 21C by 2 hours, 5C by 6 hours.",
  },
  pastry: {
    title: "Pastry rotation",
    blurb: "Baked, sold and discarded per product per bake.",
  },
  corrective: {
    title: "Corrective actions",
    blurb: "What was found and what was done about it, most recent first.",
  },
} as const
type SectionKey = keyof typeof SECTIONS

function isSection(v: string | null): v is SectionKey {
  return v !== null && v in SECTIONS
}

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

/** Server page reads the clock legitimately; wrapped so the react-hooks
 *  purity rule (aimed at client components) doesn't flag the render body. */
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000)
}

function dayLabel(d: Date | string) {
  return formatAest(d, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

// Count notes describing an ACTION taken, not routine all-clears ("No
// activity", "All labelled, FIFO OK" are fine and vastly outnumber real
// corrective notes; matching keywords beats maintaining a whitelist).
const CORRECTIVE = /discard|binned|reheat|re-?check|door|thermostat|compressor|seal|bait|maintenance|pulled|moved|adjusted|defrost|monitor|blast chiller|notified/i

// Template filters for the two checklist-backed registers. "Food safety"
// area is the legacy marker, isFoodSafety the current one.
const FOOD_TEMP_TEMPLATE = {
  OR: [{ isFoodSafety: true }, { area: "Food Safety" }],
}
const CLEANING_TEMPLATE = {
  isFoodSafety: false,
  NOT: { area: "Food Safety" },
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
  const viewParam = typeof sp.view === "string" ? sp.view : null
  const section: SectionKey | null = isSection(viewParam) ? viewParam : null
  const fromDate = daysAgo(rangeDays)

  const venueWhere =
    venueFilter !== "ALL"
      ? { venue: venueFilter as Venue }
      : { venue: { in: [...SINGLE_VENUES] as Venue[] } }

  const venueLabel =
    venueFilter === "ALL"
      ? "All venues"
      : VENUE_LABEL[venueFilter].replace(/\s*\(.*\)$/, "")
  // On "All venues" the middle crumb should return to the venue picker
  // (/kitchen with no param), not silently drop into Burleigh's checklists.
  const venueCrumbHref =
    venueFilter === "ALL" ? "/kitchen" : `/kitchen?venue=${venueFilter}`
  const landingHref = `/kitchen/inspection?venue=${venueFilter}&days=${rangeDays}`

  const crumbs = [
    { label: "Venues", href: "/kitchen" },
    {
      label: venueFilter === "ALL" ? "All venues" : VENUE_SHORT_LABEL[venueFilter],
      href: venueCrumbHref,
    },
    section
      ? { label: "Inspection view", href: landingHref }
      : { label: "Inspection view" },
    ...(section ? [{ label: SECTIONS[section].title }] : []),
  ]

  return (
    <div className="space-y-5 md:space-y-6">
      <RefreshOnResume />
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div className="min-w-0 flex-1">
          <KitchenBreadcrumb crumbs={crumbs} />
        </div>
        <div className="shrink-0">
          <InspectionPrintButton />
        </div>
      </div>

      {section === null ? (
        <InspectionHome
          venueFilter={venueFilter}
          rangeDays={rangeDays}
          fromDate={fromDate}
          venueWhere={venueWhere}
          venueLabel={venueLabel}
        />
      ) : (
        <InspectionSection
          section={section}
          venueFilter={venueFilter}
          rangeDays={rangeDays}
          fromDate={fromDate}
          venueWhere={venueWhere}
          landingHref={landingHref}
        />
      )}
    </div>
  )
}

/* ── Landing: pick a register ──────────────────────────────────────────── */

async function InspectionHome({
  venueFilter,
  rangeDays,
  fromDate,
  venueWhere,
  venueLabel,
}: {
  venueFilter: VenueFilter
  rangeDays: number
  fromDate: Date
  venueWhere: Record<string, unknown>
  venueLabel: string
}) {
  // Light queries only: counts and latest dates, never full records.
  const [runMeta, coolingMeta, pastryAgg, noteRows, councilDocs] =
    await Promise.all([
      db.checklistRun.findMany({
        where: { runDate: { gte: fromDate }, ...venueWhere },
        select: {
          runDate: true,
          template: { select: { isFoodSafety: true, area: true } },
        },
        orderBy: { runDate: "desc" },
        take: 2000,
      }),
      db.coolingLog.findMany({
        where: { startedAt: { gte: fromDate }, ...venueWhere },
        select: { startedAt: true, twoHourTempC: true, sixHourTempC: true },
        orderBy: { startedAt: "desc" },
      }),
      db.pastryRotationEntry.aggregate({
        where: { entryDate: { gte: fromDate }, ...venueWhere },
        _count: true,
        _max: { entryDate: true },
        _sum: { discarded: true },
      }),
      db.checklistRunItem.findMany({
        where: {
          note: { not: null },
          run: { runDate: { gte: fromDate }, ...venueWhere },
        },
        select: { note: true, run: { select: { runDate: true } } },
      }),
      db.councilDocument.findMany({
        where: {
          type: {
            in: ["FOOD_BUSINESS_LICENCE", "FSS_CERTIFICATE", "FSS_NOTIFICATION"],
          },
          ...(venueFilter !== "ALL" ? { venue: venueFilter as Venue } : {}),
        },
        select: {
          id: true, venue: true, type: true, title: true, expiresOn: true,
        },
        orderBy: [{ type: "asc" }, { title: "asc" }],
      }),
    ])

  const isFoodTemp = (t: { isFoodSafety: boolean; area: string | null }) =>
    t.isFoodSafety || t.area === "Food Safety"
  const cleaningRuns = runMeta.filter((r) => !isFoodTemp(r.template))
  const foodTempRuns = runMeta.filter((r) => isFoodTemp(r.template))
  const coolingFails = coolingMeta.filter(
    (c) =>
      (c.twoHourTempC !== null && Number(c.twoHourTempC) > 21) ||
      (c.sixHourTempC !== null && Number(c.sixHourTempC) > 5)
  ).length
  const correctiveNotes = noteRows.filter(
    (n) => n.note && CORRECTIVE.test(n.note)
  )
  const correctiveLatest = correctiveNotes.reduce<Date | null>(
    (m, n) => (!m || n.run.runDate > m ? n.run.runDate : m),
    null
  )
  const correctiveCount = correctiveNotes.length + coolingFails

  const todayKey = dayKey(daysAgo(0))
  const yesterdayKey = dayKey(daysAgo(1))
  const freshDaily = (d: Date | string | null) =>
    d !== null && [todayKey, yesterdayKey].includes(dayKey(d))

  const latestNote = (d: Date | string | null, extra?: string) =>
    d
      ? `latest ${formatAest(d, { day: "numeric", month: "short" })}${extra ?? ""}`
      : "no records in range"

  const pastryLatest = pastryAgg._max.entryDate
  const pastryDiscarded = pastryAgg._sum.discarded ?? 0

  const query = `venue=${venueFilter}&days=${rangeDays}`
  const licenceDocs = councilDocs.filter((d) => d.type === "FOOD_BUSINESS_LICENCE")
  const fssDocs = councilDocs.filter((d) => d.type !== "FOOD_BUSINESS_LICENCE")

  return (
    <>
      <div className="px-1">
        <h1
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Inspection view
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-snug text-[var(--tk-ink-soft)] md:text-[16px]">
          Read-only record of food safety activity. Pick the register the
          inspector wants to see.
        </p>
      </div>

      {/* Venue comes first: everything below is scoped to it */}
      <FilterGroup label="Venue">
        <FilterPill href={`?venue=ALL&days=${rangeDays}`} active={venueFilter === "ALL"}>
          All
        </FilterPill>
        {SINGLE_VENUES.map((v) => (
          <FilterPill
            key={v}
            href={`?venue=${v}&days=${rangeDays}`}
            active={venueFilter === v}
          >
            {VENUE_SHORT_LABEL[v]}
          </FilterPill>
        ))}
      </FilterGroup>

      {/* Documents & FSS, the folder the EHO asks for first */}
      <Link
        href={venueFilter === "ALL" ? "/council" : `/council/${venueFilter}`}
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

      {/* The registers, one box each */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RegisterTile
          href={`?${query}&view=cleaning`}
          icon={<SprayCan className="h-6 w-6" strokeWidth={1.8} />}
          title={SECTIONS.cleaning.title}
          count={cleaningRuns.length}
          countLabel="signed runs"
          note={latestNote(cleaningRuns[0]?.runDate ?? null)}
          ok={freshDaily(cleaningRuns[0]?.runDate ?? null)}
        />
        <RegisterTile
          href={`?${query}&view=food-temps`}
          icon={<Thermometer className="h-6 w-6" strokeWidth={1.8} />}
          title={SECTIONS["food-temps"].title}
          count={foodTempRuns.length}
          countLabel="signed runs"
          note={latestNote(foodTempRuns[0]?.runDate ?? null)}
          ok={freshDaily(foodTempRuns[0]?.runDate ?? null)}
        />
        <RegisterTile
          href={`?${query}&view=cooling`}
          icon={<Snowflake className="h-6 w-6" strokeWidth={1.8} />}
          title={SECTIONS.cooling.title}
          count={coolingMeta.length}
          countLabel="batches"
          note={latestNote(coolingMeta[0]?.startedAt ?? null)}
          ok={coolingMeta.length > 0}
        />
        <RegisterTile
          href={`?${query}&view=pastry`}
          icon={<Croissant className="h-6 w-6" strokeWidth={1.8} />}
          title={SECTIONS.pastry.title}
          count={pastryAgg._count}
          countLabel="entries"
          note={latestNote(
            pastryLatest,
            pastryDiscarded > 0 ? ` · ${pastryDiscarded} discarded` : ""
          )}
          ok={pastryLatest !== null && freshDaily(pastryLatest)}
        />
        <RegisterTile
          href={`?${query}&view=corrective`}
          icon={<AlertTriangle className="h-6 w-6" strokeWidth={1.8} />}
          title={SECTIONS.corrective.title}
          count={correctiveCount}
          countLabel="actions"
          note={
            correctiveCount === 0
              ? `none needed in ${rangeDays} days`
              : latestNote(correctiveLatest)
          }
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

      <p className="px-1 text-[12px] text-[var(--tk-ink-mute)]">
        Counts cover the last {rangeDays} days at {venueLabel}. Date range is
        chosen inside each register.
      </p>
    </>
  )
}

function RegisterTile({
  href,
  icon,
  title,
  count,
  countLabel,
  note,
  ok,
}: {
  href: string
  icon: React.ReactNode
  title: string
  count: number
  countLabel: string
  note: string
  ok: boolean
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[18px] border border-[var(--tk-line)] bg-white px-4 py-4 transition active:scale-[0.997] sm:px-5"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-2 text-[16px] font-semibold leading-tight text-[var(--tk-charcoal)] sm:text-[17px]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: ok ? "var(--tk-done)" : "var(--tk-warn)" }}
            aria-label={ok ? "up to date" : "check freshness"}
          />
        </div>
        <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
          <span className="font-semibold tabular-nums text-[var(--tk-charcoal)]">
            {count}
          </span>{" "}
          {countLabel} · {note}
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
        <ArrowRight className="h-[16px] w-[16px]" />
      </div>
    </Link>
  )
}

/* ── Section: one register, date range on top ──────────────────────────── */

async function InspectionSection({
  section,
  venueFilter,
  rangeDays,
  fromDate,
  venueWhere,
  landingHref,
}: {
  section: SectionKey
  venueFilter: VenueFilter
  rangeDays: number
  fromDate: Date
  venueWhere: Record<string, unknown>
  landingHref: string
}) {
  const meta = SECTIONS[section]
  const showVenue = venueFilter === "ALL"

  const needRuns = section === "cleaning" || section === "food-temps"
  const [coolingLogs, pastryRows, checklistRuns, noteItems] = await Promise.all([
    section === "cooling" || section === "corrective"
      ? listCoolingLogsForInspection({ venue: venueFilter, fromDate })
      : Promise.resolve([] as CoolingLogRecord[]),
    section === "pastry"
      ? listPastryRotationForInspection({ venue: venueFilter, fromDate })
      : Promise.resolve([] as InspectionPastryRow[]),
    needRuns
      ? db.checklistRun.findMany({
          where: {
            runDate: { gte: fromDate },
            ...venueWhere,
            template:
              section === "cleaning" ? CLEANING_TEMPLATE : FOOD_TEMP_TEMPLATE,
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
        })
      : Promise.resolve([]),
    section === "corrective"
      ? db.checklistRunItem.findMany({
          where: {
            note: { not: null },
            run: { runDate: { gte: fromDate }, ...venueWhere },
          },
          select: {
            id: true,
            note: true,
            checkedBy: true,
            checkedAt: true,
            templateItem: { select: { label: true } },
            run: {
              select: {
                runDate: true,
                venue: true,
                template: { select: { name: true } },
              },
            },
          },
          orderBy: { run: { runDate: "desc" } },
        })
      : Promise.resolve([]),
  ])

  return (
    <>
      <div className="px-1">
        <Link
          href={landingHref}
          className="mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-[var(--tk-ink-soft)] print:hidden"
        >
          <ChevronLeft className="h-4 w-4" /> All registers
        </Link>
        <h1
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          {meta.title}
        </h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-snug text-[var(--tk-ink-soft)] md:text-[16px]">
          {meta.blurb}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <FilterGroup label="Venue">
          <FilterPill
            href={`?venue=ALL&days=${rangeDays}&view=${section}`}
            active={venueFilter === "ALL"}
          >
            All
          </FilterPill>
          {SINGLE_VENUES.map((v) => (
            <FilterPill
              key={v}
              href={`?venue=${v}&days=${rangeDays}&view=${section}`}
              active={venueFilter === v}
            >
              {VENUE_SHORT_LABEL[v]}
            </FilterPill>
          ))}
        </FilterGroup>
        <FilterGroup label="Range">
          {RANGE_OPTIONS.map((r) => (
            <FilterPill
              key={r.value}
              href={`?venue=${venueFilter}&days=${r.value}&view=${section}`}
              active={rangeDays === r.value}
            >
              Last {r.label}
            </FilterPill>
          ))}
        </FilterGroup>
      </div>

      {section === "corrective" ? (
        <CorrectiveRegister
          noteItems={noteItems}
          coolingLogs={coolingLogs}
          rangeDays={rangeDays}
          showVenue={showVenue}
        />
      ) : (
        <SectionDays
          section={section}
          coolingLogs={coolingLogs}
          pastryRows={pastryRows}
          checklistRuns={checklistRuns}
          rangeDays={rangeDays}
          showVenue={showVenue}
        />
      )}
    </>
  )
}

function SectionDays({
  section,
  coolingLogs,
  pastryRows,
  checklistRuns,
  rangeDays,
  showVenue,
}: {
  section: SectionKey
  coolingLogs: CoolingLogRecord[]
  pastryRows: InspectionPastryRow[]
  checklistRuns: InspectionRun[]
  rangeDays: number
  showVenue: boolean
}) {
  const days = new Map<
    string,
    {
      label: string
      cooling: CoolingLogRecord[]
      runs: InspectionRun[]
      pastry: InspectionPastryRow[]
    }
  >()
  const ensureDay = (sourceDate: Date | string) => {
    const k = dayKey(sourceDate)
    let d = days.get(k)
    if (!d) {
      d = { label: dayLabel(sourceDate), cooling: [], runs: [], pastry: [] }
      days.set(k, d)
    }
    return d
  }
  if (section === "cooling")
    for (const c of coolingLogs) ensureDay(c.startedAt).cooling.push(c)
  if (section === "pastry")
    for (const p of pastryRows) ensureDay(`${p.date}T00:00:00.000Z`).pastry.push(p)
  if (section === "cleaning" || section === "food-temps")
    for (const r of checklistRuns) ensureDay(r.runDate).runs.push(r)

  const orderedDays = Array.from(days.entries()).sort((a, b) =>
    b[0].localeCompare(a[0])
  )
  const total =
    section === "cooling"
      ? `${coolingLogs.length} batches`
      : section === "pastry"
        ? `${pastryRows.length} entries`
        : `${checklistRuns.length} signed runs`

  return (
    <>
      <div className="rounded-[12px] border border-[var(--tk-line)] bg-white px-5 py-3 text-[13px] text-[var(--tk-ink-soft)] print:border-black">
        <strong className="text-[var(--tk-charcoal)]">{total}</strong> in the
        last {rangeDays} days · {orderedDays.length} days with records
      </div>

      {orderedDays.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-12 text-center text-[14px] text-[var(--tk-ink-soft)]">
          No records in this range. Widen the range above.
        </div>
      ) : (
        orderedDays.map(([key, d], idx) => (
          <details
            key={key}
            open={idx === 0}
            className="group rounded-[16px] border border-[var(--tk-line)] bg-white print:border-0 print:[&[open]]:block"
          >
            <summary className="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span
                className="tk-display leading-none text-[var(--tk-charcoal)]"
                style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}
              >
                {d.label}
              </span>
              <span className="text-[13px] tabular-nums text-[var(--tk-ink-soft)]">
                {section === "cooling" && `${d.cooling.length} batches`}
                {section === "pastry" && `${d.pastry.length} entries`}
                {(section === "cleaning" || section === "food-temps") &&
                  `${d.runs.length} checklists`}
                <span className="ml-2 text-[var(--tk-ink-mute)] transition group-open:hidden">
                  tap to expand
                </span>
              </span>
            </summary>
            <div className="border-t border-[var(--tk-line)] px-5 py-4">
              <DayBlock
                cooling={d.cooling}
                runs={d.runs}
                pastry={d.pastry}
                showVenue={showVenue}
              />
            </div>
          </details>
        ))
      )}
    </>
  )
}

/* ── Corrective actions register ───────────────────────────────────────── */

type NoteItem = {
  id: string
  note: string | null
  checkedBy: string | null
  checkedAt: Date | null
  templateItem: { label: string }
  run: { runDate: Date; venue: Venue; template: { name: string } }
}

function CorrectiveRegister({
  noteItems,
  coolingLogs,
  rangeDays,
  showVenue,
}: {
  noteItems: NoteItem[]
  coolingLogs: CoolingLogRecord[]
  rangeDays: number
  showVenue: boolean
}) {
  const flagged = noteItems.filter((n) => n.note && CORRECTIVE.test(n.note))
  const coolingFails = coolingLogs.filter(
    (c) =>
      (c.twoHourTempC !== null && c.twoHourTempC > 21) ||
      (c.sixHourTempC !== null && c.sixHourTempC > 5)
  )
  const entries = [
    ...flagged.map((n) => ({
      date: n.run.runDate,
      venue: n.run.venue,
      source: n.run.template.name,
      found: n.templateItem.label,
      action: n.note ?? "",
      by: n.checkedBy,
    })),
    ...coolingFails.map((c) => ({
      date: new Date(c.startedAt),
      venue: c.venue as Venue,
      source: "Cooling log",
      found: `${c.itemName}: checkpoint exceeded (2hr ${c.twoHourTempC ?? "-"}C / 6hr ${c.sixHourTempC ?? "-"}C)`,
      action: c.notes ?? "See cooling log entry",
      by: c.staffInitials,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime())

  return (
    <>
      <div className="rounded-[12px] border border-[var(--tk-line)] bg-white px-5 py-3 text-[13px] text-[var(--tk-ink-soft)] print:border-black">
        <strong className="text-[var(--tk-charcoal)]">
          {entries.length} corrective action{entries.length === 1 ? "" : "s"}
        </strong>{" "}
        in the last {rangeDays} days. Notes that record an action taken;
        routine all-clear notes are not listed.
      </div>

      {entries.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-[var(--tk-line)] bg-white px-5 py-12 text-center text-[14px] text-[var(--tk-ink-soft)]">
          Nothing needed corrective action in this range.
        </div>
      ) : (
        <div className="space-y-2.5">
          {entries.map((e, i) => (
            <div
              key={i}
              className="rounded-[14px] border border-[var(--tk-line)] bg-white px-4 py-3.5 sm:px-5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--tk-ink-soft)]">
                <span className="font-semibold text-[var(--tk-charcoal)]">
                  {formatAest(e.date, { weekday: "short", day: "numeric", month: "short" })}
                </span>
                <span>· {e.source}</span>
                {showVenue && (
                  <span>· {VENUE_SHORT_LABEL[e.venue as SingleVenue] ?? e.venue}</span>
                )}
                {e.by && <span>· by {e.by}</span>}
              </div>
              <div className="mt-1 text-[14px] font-semibold leading-snug text-[var(--tk-charcoal)]">
                {e.found}
              </div>
              <div className="mt-0.5 text-[14px] leading-snug text-[var(--tk-ink)]">
                {e.action}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ── Shared bits ───────────────────────────────────────────────────────── */

function FilterGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex max-w-full items-center gap-1.5 overflow-x-auto rounded-full bg-white px-2 py-1.5 ring-1 ring-[var(--tk-line)]">
      <span
        className="shrink-0 px-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--tk-ink-mute)]"
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
      className="shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[13px] font-semibold transition"
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
  cooling,
  runs,
  pastry,
  showVenue,
}: {
  cooling: CoolingLogRecord[]
  runs: InspectionRun[]
  pastry: InspectionPastryRow[]
  showVenue: boolean
}) {
  return (
    <section className="space-y-3">
      {cooling.length > 0 && (
        <div className="overflow-x-auto rounded-[12px] border border-[var(--tk-line)] bg-white print:border-black">
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
      )}

      {runs.length > 0 && (
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
      )}

      {pastry.length > 0 && (
        <div className="overflow-x-auto rounded-[12px] border border-[var(--tk-line)] bg-white print:border-black">
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
      )}
    </section>
  )
}
