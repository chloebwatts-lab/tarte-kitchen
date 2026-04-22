export const dynamic = "force-dynamic"

import type { ReactNode } from "react"
import Link from "next/link"
import { ShieldCheck } from "lucide-react"
import { listChecklistTemplates, type ChecklistTemplateSummary } from "@/lib/actions/checklists"
import { KitchenVenuePicker } from "@/components/kitchen-venue-picker"

function isCompliance(t: ChecklistTemplateSummary) {
  return t.isFoodSafety || t.area === "Food Safety"
}

export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : null
  if (!venueParam) return <KitchenVenuePicker />

  const v =
    venueParam === "BURLEIGH" ||
    venueParam === "BEACH_HOUSE" ||
    venueParam === "TEA_GARDEN"
      ? venueParam
      : "BURLEIGH"

  const templates = await listChecklistTemplates({ venue: v })

  return <KitchenHome templates={templates} venue={v} />
}

function TemplateCard({
  t,
  venue,
}: {
  t: ChecklistTemplateSummary
  venue: string
}) {
  const completion = t.todayRun
    ? t.todayRun.totalItems > 0
      ? Math.round((t.todayRun.completedItems / t.todayRun.totalItems) * 100)
      : 0
    : 0
  const done = t.todayRun?.status === "COMPLETED"
  const href = t.todayRun
    ? `/kitchen/run/${t.todayRun.id}`
    : `/kitchen/start/${t.id}?venue=${venue}`

  return (
    <Link
      href={href}
      className={`block rounded-2xl border-2 p-5 transition active:scale-[0.99] ${
        done
          ? "border-emerald-200 bg-emerald-50"
          : t.todayRun
            ? "border-amber-200 bg-amber-50"
            : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-lg font-semibold">{t.name}</div>
          <div className="mt-0.5 text-sm text-muted-foreground">
            {t.area && t.area !== "Food Safety" ? `${t.area} · ` : ""}
            {t.shift.toLowerCase()} · {t.itemCount} items
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-bold tabular-nums">
            {t.todayRun
              ? `${t.todayRun.completedItems}/${t.todayRun.totalItems}`
              : "—"}
          </div>
          {t.todayRun && !done && (
            <div className="text-xs text-muted-foreground">{completion}%</div>
          )}
          {done && (
            <div className="text-sm font-medium text-emerald-700">✓ Done</div>
          )}
        </div>
      </div>
      {t.todayRun && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className={done ? "h-full bg-emerald-500" : "h-full bg-amber-500"}
            style={{ width: `${completion}%` }}
          />
        </div>
      )}
    </Link>
  )
}

function Section({
  title,
  icon,
  templates,
  venue,
}: {
  title: string
  icon?: ReactNode
  templates: ChecklistTemplateSummary[]
  venue: string
}) {
  if (templates.length === 0) return null
  const running = templates.filter((t) => t.todayRun && t.todayRun.status !== "COMPLETED")
  const done = templates.filter((t) => t.todayRun?.status === "COMPLETED")
  const notStarted = templates.filter((t) => !t.todayRun)
  const ordered = [...running, ...notStarted, ...done]

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
        {done.length > 0 && (
          <span className="text-sm text-emerald-600 font-medium">
            {done.length}/{templates.length} done
          </span>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ordered.map((t) => (
          <TemplateCard key={t.id} t={t} venue={venue} />
        ))}
      </div>
    </div>
  )
}

function KitchenHome({
  templates,
  venue,
}: {
  templates: ChecklistTemplateSummary[]
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
}) {
  const venueLabel =
    venue === "BURLEIGH"
      ? "Tarte Bakery"
      : venue === "BEACH_HOUSE"
        ? "Beach House"
        : "Tea Garden"

  const cleaning = templates.filter((t) => !isCompliance(t))
  const compliance = templates.filter(isCompliance)

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Kitchen · {venueLabel}
          </div>
          <h1 className="text-3xl font-bold">Today&apos;s checklists</h1>
        </div>
        <Link
          href="/kitchen"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium"
        >
          Change venue
        </Link>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-muted-foreground">
            No checklists for this venue yet. Ask a manager to create one in the
            full admin app.
          </p>
        </div>
      ) : (
        <>
          <Section
            title="Cleaning & Daily Tasks"
            templates={cleaning}
            venue={venue}
          />
          <Section
            title="Food Safety Checks"
            icon={<ShieldCheck className="h-5 w-5 text-emerald-600" />}
            templates={compliance}
            venue={venue}
          />
        </>
      )}
    </div>
  )
}
