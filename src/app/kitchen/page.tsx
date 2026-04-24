export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, ArrowRight, ClipboardCheck, ShieldCheck, Snowflake, SprayCan, Thermometer } from "lucide-react"
import { listChecklistTemplates, type ChecklistTemplateSummary } from "@/lib/actions/checklists"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { KitchenLogo } from "@/components/kitchen/KitchenLogo"
import { KitchenStepper } from "@/components/kitchen/KitchenStepper"
import { KitchenCategoryCard } from "@/components/kitchen/KitchenCategoryCard"
import { VENUE_LABEL } from "@/lib/venues"

type Venue = "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
type Category = "cleaning" | "compliance"

function isCompliance(t: ChecklistTemplateSummary) {
  return t.isFoodSafety || t.area === "Food Safety"
}

function progressTotals(templates: ChecklistTemplateSummary[]) {
  const total = templates.length
  const done = templates.filter((t) => t.todayRun?.status === "COMPLETED").length
  const inProgress = templates.filter(
    (t) => t.todayRun && t.todayRun.status !== "COMPLETED"
  ).length
  const notStarted = total - done - inProgress
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return { total, done, inProgress, notStarted, pct }
}

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  if (!venueParam) return <KitchenVenuePicker />

  const venue: Venue =
    venueParam === "BURLEIGH" ||
    venueParam === "BEACH_HOUSE" ||
    venueParam === "TEA_GARDEN"
      ? venueParam
      : "BURLEIGH"

  const categoryParam = typeof sp.category === "string" ? sp.category : null
  const category: Category | null =
    categoryParam === "cleaning" || categoryParam === "compliance"
      ? categoryParam
      : null

  const departmentParam =
    typeof sp.department === "string" ? sp.department : null

  const templates = await listChecklistTemplates({ venue })

  if (!category) return <CategoryPicker templates={templates} venue={venue} />

  const categoryTemplates =
    category === "cleaning"
      ? templates.filter((t) => !isCompliance(t))
      : templates.filter(isCompliance)

  if (!departmentParam) {
    return (
      <DepartmentPicker
        templates={categoryTemplates}
        venue={venue}
        category={category}
      />
    )
  }

  return (
    <TemplateList
      templates={categoryTemplates}
      venue={venue}
      category={category}
      department={departmentParam}
    />
  )
}

function ProgressRing({
  pct,
  color,
  size = 52,
  label,
}: {
  pct: number
  color: string
  size?: number
  label?: string
}) {
  const r = size / 2 - 4
  const c = 2 * Math.PI * r
  const offset = c - (pct / 100) * c
  return (
    <div
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox={`0 0 ${size} ${size}`} className="h-full w-full -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--tk-line)"
          strokeWidth="4"
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth="4"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .3s ease" }}
        />
      </svg>
      <span className="absolute text-[13px] font-semibold tabular-nums text-[var(--tk-charcoal)]">
        {label ?? `${pct}%`}
      </span>
    </div>
  )
}

function TemplateRow({
  t,
  venue,
  accent,
}: {
  t: ChecklistTemplateSummary
  venue: string
  accent: "sage" | "gold"
}) {
  const total = t.todayRun?.totalItems ?? t.itemCount
  const done = t.todayRun?.completedItems ?? 0
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  const isDone = t.todayRun?.status === "COMPLETED"
  const inProgress = !!t.todayRun && !isDone
  const href = t.todayRun
    ? `/kitchen/run/${t.todayRun.id}`
    : `/kitchen/start/${t.id}?venue=${venue}`

  const ringColor = isDone
    ? "var(--tk-done)"
    : accent === "sage"
      ? "var(--tk-sage)"
      : "var(--tk-gold)"

  const statusChip = isDone
    ? { label: "Complete", bg: "var(--tk-done-soft)", fg: "var(--tk-done)" }
    : inProgress
      ? { label: "In progress", bg: "var(--tk-gold-soft)", fg: "#8a6d1f" }
      : { label: "Not started", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" }

  return (
    <Link
      href={href}
      className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
    >
      <ProgressRing pct={pct} color={ringColor} />
      <div className="min-w-0 flex-1">
        <div
          className="text-[18px] font-semibold leading-snug text-[var(--tk-charcoal)]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {t.name}
        </div>
        <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
          {t.shift.toLowerCase()} shift
        </div>
      </div>
      <div
        className="hidden shrink-0 items-center rounded-full px-3 py-1.5 text-[12px] font-semibold md:inline-flex"
        style={{ background: statusChip.bg, color: statusChip.fg }}
      >
        {statusChip.label}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="tk-display text-[22px] font-bold leading-none text-[var(--tk-charcoal)]">
          {done}/{total}
        </div>
        <div className="mt-1 text-[12px] text-[var(--tk-ink-soft)]">items</div>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
        <ArrowRight className="h-[18px] w-[18px]" />
      </div>
    </Link>
  )
}

function DepartmentRow({
  name,
  templates,
  venue,
  category,
  accent,
}: {
  name: string
  templates: ChecklistTemplateSummary[]
  venue: Venue
  category: Category
  accent: "sage" | "gold"
}) {
  const { total, done, inProgress, pct } = progressTotals(templates)
  const isDone = total > 0 && done === total
  const ringColor = isDone
    ? "var(--tk-done)"
    : accent === "sage"
      ? "var(--tk-sage)"
      : "var(--tk-gold)"

  const statusChip = isDone
    ? { label: "Complete", bg: "var(--tk-done-soft)", fg: "var(--tk-done)" }
    : inProgress > 0
      ? { label: "In progress", bg: "var(--tk-gold-soft)", fg: "#8a6d1f" }
      : { label: "Not started", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" }

  return (
    <Link
      href={`/kitchen?venue=${venue}&category=${category}&department=${encodeURIComponent(name)}`}
      className="group flex min-h-[88px] items-center gap-5 rounded-[16px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
    >
      <ProgressRing pct={pct} color={ringColor} />
      <div className="min-w-0 flex-1">
        <div
          className="text-[20px] font-semibold leading-snug text-[var(--tk-charcoal)]"
          style={{ letterSpacing: "-0.015em" }}
        >
          {name}
        </div>
        <div className="mt-0.5 text-[14px] text-[var(--tk-ink-soft)]">
          {total} checklist{total === 1 ? "" : "s"}
        </div>
      </div>
      <div
        className="hidden shrink-0 items-center rounded-full px-3 py-1.5 text-[12px] font-semibold md:inline-flex"
        style={{ background: statusChip.bg, color: statusChip.fg }}
      >
        {statusChip.label}
      </div>
      <div className="shrink-0 text-right tabular-nums">
        <div className="tk-display text-[22px] font-bold leading-none text-[var(--tk-charcoal)]">
          {done}/{total}
        </div>
        <div className="mt-1 text-[12px] text-[var(--tk-ink-soft)]">done</div>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
        <ArrowRight className="h-[18px] w-[18px]" />
      </div>
    </Link>
  )
}

function KitchenHeader({
  venueLabel,
  backHref,
  backLabel,
}: {
  venueLabel: string
  backHref: string
  backLabel: string
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--tk-line)] pb-4">
      <Link
        href={backHref}
        className="inline-flex items-center gap-2 px-2 py-2 text-[14px] font-semibold text-[var(--tk-ink-soft)]"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      <KitchenLogo size={0.9} />
      <div className="w-[140px] text-right text-[13px] font-semibold tabular-nums text-[var(--tk-ink-soft)]">
        {venueLabel}
      </div>
    </div>
  )
}

function CategoryPicker({
  templates,
  venue,
}: {
  templates: ChecklistTemplateSummary[]
  venue: Venue
}) {
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const cleaning = templates.filter((t) => !isCompliance(t))
  const compliance = templates.filter(isCompliance)
  const cleaningDue = cleaning.filter((t) => t.todayRun?.status !== "COMPLETED").length
  const complianceDue = compliance.filter((t) => t.todayRun?.status !== "COMPLETED").length

  return (
    <div className="space-y-8">
      <KitchenHeader venueLabel={venueLabel} backHref="/kitchen" backLabel="Change venue" />
      <KitchenStepper currentStep={2} />

      <div>
        <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
          {venueLabel}
        </div>
        <h1
          className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}
        >
          What are you logging today?
        </h1>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <KitchenCategoryCard
          tone="sage"
          title="Cleaning"
          subtitle="Opening, during-service and close-down cleaning checklists, by area."
          icon={<SprayCan className="h-8 w-8" strokeWidth={1.8} />}
          stats={[
            { label: "Lists", value: cleaning.length },
            { label: "Due today", value: cleaningDue },
          ]}
          href={`/kitchen?venue=${venue}&category=cleaning`}
        />
        <KitchenCategoryCard
          tone="gold"
          title="Food Temp Logs"
          subtitle="Fridge, freezer and hot-hold readings. Logged throughout the day."
          icon={<Thermometer className="h-8 w-8" strokeWidth={1.8} />}
          stats={[
            { label: "Lists", value: compliance.length },
            { label: "Due today", value: complianceDue },
          ]}
          href={`/kitchen?venue=${venue}&category=compliance`}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SecondaryTile
          title="Cooling log"
          subtitle="Per-batch HACCP record for cooked items going into the cool room."
          icon={<Snowflake className="h-6 w-6" strokeWidth={1.8} />}
          href={`/kitchen/cooling?venue=${venue}`}
        />
        <SecondaryTile
          title="Inspection view"
          subtitle="One screen to hand the iPad to council — last 30 days of records."
          icon={<ClipboardCheck className="h-6 w-6" strokeWidth={1.8} />}
          href={`/kitchen/inspection?venue=${venue}`}
        />
      </div>
    </div>
  )
}

function SecondaryTile({
  title,
  subtitle,
  icon,
  href,
}: {
  title: string
  subtitle: string
  icon: React.ReactNode
  href: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: "var(--tk-sage-soft)", color: "var(--tk-sage)" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className="text-[17px] font-semibold leading-tight text-[var(--tk-charcoal)]"
          style={{ letterSpacing: "-0.01em" }}
        >
          {title}
        </div>
        <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">
          {subtitle}
        </div>
      </div>
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--tk-bg)] text-[var(--tk-ink-soft)] transition group-hover:bg-[var(--tk-charcoal)] group-hover:text-white">
        <ArrowRight className="h-[16px] w-[16px]" />
      </div>
    </Link>
  )
}

function DepartmentPicker({
  templates,
  venue,
  category,
}: {
  templates: ChecklistTemplateSummary[]
  venue: Venue
  category: Category
}) {
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const accent: "sage" | "gold" = category === "cleaning" ? "sage" : "gold"

  // Group by area (department). Null area = "General".
  const groups = new Map<string, ChecklistTemplateSummary[]>()
  for (const t of templates) {
    const key = t.area ?? "General"
    const list = groups.get(key) ?? []
    list.push(t)
    groups.set(key, list)
  }
  const ordered = Array.from(groups.entries()).sort((a, b) =>
    a[0].localeCompare(b[0])
  )

  const heading = category === "cleaning" ? "Pick your section" : "Temperature logs by area"
  const subhead =
    category === "cleaning"
      ? "Barista, FOH, KP, Market, Takeaway — pick yours to see today's cleaning checklists."
      : "Fridges, freezers and hot-hold readings grouped by area."

  return (
    <div className="space-y-8">
      <KitchenHeader
        venueLabel={venueLabel}
        backHref={`/kitchen?venue=${venue}`}
        backLabel="Category"
      />
      <KitchenStepper currentStep={3} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
            {venueLabel} · {category === "cleaning" ? "Cleaning" : "Food Temp"}
          </div>
          <h1
            className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
            style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}
          >
            {heading}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[var(--tk-ink-soft)]">
            {subhead}
          </p>
        </div>
        {category === "compliance" && (
          <div className="mb-1 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[var(--tk-done)]" />
            <span className="tk-caps" style={{ color: "var(--tk-ink-soft)" }}>
              HACCP
            </span>
          </div>
        )}
      </div>

      {ordered.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center">
          <p className="text-[15px] font-semibold text-[var(--tk-charcoal)]">
            No{" "}
            {category === "cleaning" ? "cleaning checklists" : "food temperature logs"}{" "}
            for this venue yet.
          </p>
          <p className="mt-2 text-[13px] text-[var(--tk-ink-soft)]">
            Ask a manager to create one in the full admin app.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {ordered.map(([name, templates]) => (
            <DepartmentRow
              key={name}
              name={name}
              templates={templates}
              venue={venue}
              category={category}
              accent={accent}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateList({
  templates,
  venue,
  category,
  department,
}: {
  templates: ChecklistTemplateSummary[]
  venue: Venue
  category: Category
  department: string
}) {
  const venueLabel = VENUE_LABEL[venue].replace(/\s*\(.*\)$/, "")
  const filtered = templates.filter((t) => (t.area ?? "General") === department)

  const accent: "sage" | "gold" = category === "cleaning" ? "sage" : "gold"

  const running = filtered.filter((t) => t.todayRun && t.todayRun.status !== "COMPLETED")
  const done = filtered.filter((t) => t.todayRun?.status === "COMPLETED")
  const notStarted = filtered.filter((t) => !t.todayRun)
  const ordered = [...running, ...notStarted, ...done]

  return (
    <div className="space-y-8">
      <KitchenHeader
        venueLabel={venueLabel}
        backHref={`/kitchen?venue=${venue}&category=${category}`}
        backLabel="Section"
      />
      <KitchenStepper currentStep={4} />

      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="tk-caps mb-2" style={{ color: "var(--tk-ink-mute)" }}>
            {venueLabel} · {category === "cleaning" ? "Cleaning" : "Food Temp"} · {department}
          </div>
          <h1
            className="tk-display leading-[1.05] text-[var(--tk-charcoal)]"
            style={{ fontSize: 44, fontWeight: 600, letterSpacing: "-0.03em" }}
          >
            {department}
          </h1>
          <p className="mt-2 max-w-xl text-[15px] text-[var(--tk-ink-soft)]">
            Pick a checklist to open.
          </p>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-[var(--tk-line)] bg-white p-10 text-center text-[14px] text-[var(--tk-ink-soft)]">
          No checklists in this section.
        </div>
      ) : (
        <div className="space-y-2.5">
          {ordered.map((t) => (
            <TemplateRow key={t.id} t={t} venue={venue} accent={accent} />
          ))}
        </div>
      )}
    </div>
  )
}
