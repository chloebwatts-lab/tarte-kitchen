export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowRight, CakeSlice, Croissant, Images, ShoppingCart, SprayCan, Thermometer } from "lucide-react"
import { KitchenBreadcrumb } from "@/components/kitchen/KitchenBreadcrumb"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"
import { VenueSwitch } from "@/components/kitchen/VenueSwitch"
import { PastryNotes } from "@/components/kitchen/PastryNotes"
import { PastryPrepList } from "@/components/kitchen/PastryPrepList"
import { listChecklistTemplates, type ChecklistTemplateSummary } from "@/lib/actions/checklists"
import { getPastrySection, listPastryGallery } from "@/lib/actions/pastry-section"
import { longDay } from "@/lib/high-tea/prep"
import { PREP_LISTS } from "@/lib/pastry/section"
import { stripContextPrefix } from "@/lib/display"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import { pastryVenue } from "./venue"

const CADENCE_LABEL: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "This week",
  MONTHLY: "This month",
  ON_DEMAND: "When needed",
}

function ChecklistRow({ t, venue }: { t: ChecklistTemplateSummary; venue: string }) {
  const total = t.todayRun?.totalItems ?? t.itemCount
  const done = t.todayRun?.completedItems ?? 0
  const isDone = t.todayRun?.status === "COMPLETED"
  const chip = isDone
    ? { label: "Done", bg: "var(--tk-done-soft)", fg: "var(--tk-done)" }
    : t.todayRun
      ? { label: "In progress", bg: "var(--tk-gold-soft)", fg: "#8a6d1f" }
      : { label: "Not started", bg: "var(--tk-charcoal-soft)", fg: "var(--tk-ink-soft)" }
  return (
    <Link
      href={t.todayRun ? `/kitchen/run/${t.todayRun.id}` : `/kitchen/start/${t.id}?venue=${venue}`}
      className="group flex min-h-[64px] items-center gap-3 border-t border-[var(--tk-line)] px-5 py-3 first:border-t-0 active:bg-[var(--tk-bg)]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-semibold leading-snug text-[var(--tk-charcoal)]">
          {stripContextPrefix(t.name, "Pastry")}
        </div>
        <div className="text-[13px] text-[var(--tk-ink-soft)]">
          {CADENCE_LABEL[t.cadence] ?? t.cadence} · {done}/{total} items
        </div>
      </div>
      <span className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold" style={{ background: chip.bg, color: chip.fg }}>
        {chip.label}
      </span>
      <ArrowRight className="h-[18px] w-[18px] shrink-0 text-[var(--tk-ink-mute)]" />
    </Link>
  )
}

function ChecklistCard({
  title,
  icon,
  templates,
  venue,
  empty,
}: {
  title: string
  icon: React.ReactNode
  templates: ChecklistTemplateSummary[]
  venue: string
  empty: string
}) {
  return (
    <div className="rounded-[18px] border border-[var(--tk-line)] bg-white">
      <div className="flex items-center gap-3 px-5 pt-4 pb-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px]"
          style={{ background: "var(--tk-sage-soft)", color: "var(--tk-done)" }}
        >
          {icon}
        </div>
        <h2 className="tk-display text-[24px] leading-none text-[var(--tk-charcoal)]" style={{ fontWeight: 600, letterSpacing: "-0.02em" }}>
          {title}
        </h2>
      </div>
      <div className="border-t border-[var(--tk-line)]">
        {templates.length === 0 ? (
          <div className="px-5 py-4 text-[15px] text-[var(--tk-ink-soft)]">{empty}</div>
        ) : (
          templates.map((t) => <ChecklistRow key={t.id} t={t} venue={venue} />)
        )}
      </div>
    </div>
  )
}

function Tile({ title, sub, href, icon }: { title: string; sub: string; href: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-[18px] border border-[var(--tk-line)] bg-white px-5 py-4 transition active:scale-[0.997]"
    >
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px]"
        style={{ background: "var(--tk-sage-soft)", color: "var(--tk-done)" }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-semibold leading-tight text-[var(--tk-charcoal)]">{title}</div>
        <div className="mt-0.5 text-[13px] leading-snug text-[var(--tk-ink-soft)]">{sub}</div>
      </div>
      <ArrowRight className="h-[18px] w-[18px] shrink-0 text-[var(--tk-ink-mute)]" />
    </Link>
  )
}

export default async function PastrySectionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const venue = await pastryVenue(await searchParams)
  if (!venue) return <KitchenVenuePicker />

  const [section, templates, products] = await Promise.all([
    getPastrySection(venue),
    listChecklistTemplates({ venue }),
    listPastryGallery(venue),
  ])
  const pastry = templates.filter((t) => `${t.area ?? ""} ${t.name}`.toLowerCase().includes("pastry"))
  const temps = pastry.filter((t) => t.isFoodSafety)
  const cleaning = pastry.filter((t) => !t.isFoodSafety)
  const withPhoto = products.filter((p) => p.photos.length > 0).length

  return (
    <div className="space-y-7">
      <KitchenBreadcrumb
        crumbs={[{ label: "Staff tools", href: "/staffaccess" }, { label: `Pastry, ${VENUE_SHORT_LABEL[venue]}` }]}
      />

      <div className="px-1">
        <div
          className="tk-display leading-none text-[var(--tk-charcoal)]"
          style={{ fontSize: 44, fontWeight: 700, letterSpacing: "-0.025em" }}
        >
          Pastry
        </div>
        <p className="mt-2 text-[16px] leading-snug text-[var(--tk-ink-soft)]">{longDay(section.day)}</p>
        <div className="mt-3">
          <VenueSwitch current={venue} />
        </div>
      </div>

      <PastryNotes venue={venue} notes={section.notes} />

      <div className="space-y-3">
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {PREP_LISTS.map((l) => (
            <PastryPrepList key={l.key} venue={venue} list={l.key} title={l.title} tasks={section.lists[l.key]} />
          ))}
        </div>
        <p className="px-1 text-[13px] leading-snug text-[var(--tk-ink-mute)]">
          These two lists are yours: add jobs, tick them as you go. Nothing has to be finished or signed off, and the ticks clear overnight.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <ChecklistCard
          title="Temperature checks"
          icon={<Thermometer className="h-5 w-5" strokeWidth={1.8} />}
          templates={temps}
          venue={venue}
          empty="No pastry temperature check is set up for this venue yet."
        />
        <ChecklistCard
          title="Cleaning"
          icon={<SprayCan className="h-5 w-5" strokeWidth={1.8} />}
          templates={cleaning}
          venue={venue}
          empty="No pastry cleaning list is set up for this venue yet."
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Tile
          title="Products"
          sub={`How each finished product should look. ${withPhoto} of ${products.length} have a photo.`}
          href={`/kitchen/pastry/products?venue=${venue}`}
          icon={<Images className="h-6 w-6" strokeWidth={1.8} />}
        />
        <Tile
          title="Pastry rotation"
          sub="Prepared, sold and discarded per bake."
          href={`/kitchen/pastry/rotation?venue=${venue}`}
          icon={<Croissant className="h-6 w-6" strokeWidth={1.8} />}
        />
        <Tile
          title="Pastry order"
          sub="What pastry needs ordered, into the one daily order."
          href={`/kitchen/order/pastry?venue=${venue}`}
          icon={<ShoppingCart className="h-6 w-6" strokeWidth={1.8} />}
        />
        <Tile
          title="High tea prep"
          sub="Tea Garden pastry off the high tea bookings."
          href="/kitchen/high-tea"
          icon={<CakeSlice className="h-6 w-6" strokeWidth={1.8} />}
        />
      </div>
    </div>
  )
}
