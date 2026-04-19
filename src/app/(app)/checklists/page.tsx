export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  CheckCircle2,
  Circle,
  ShieldCheck,
  Plus,
  Clock,
  AlertTriangle,
  Monitor,
} from "lucide-react"
import { listChecklistTemplates } from "@/lib/actions/checklists"
import { getOverdueChecklists } from "@/lib/actions/checklist-alerts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import { ChecklistStartButton } from "@/components/checklist-start-button"

export default async function ChecklistsPage() {
  const [templates, overdue] = await Promise.all([
    listChecklistTemplates(),
    getOverdueChecklists(),
  ])

  const grouped = {
    DAILY: templates.filter((t) => t.cadence === "DAILY"),
    WEEKLY: templates.filter((t) => t.cadence === "WEEKLY"),
    MONTHLY: templates.filter((t) => t.cadence === "MONTHLY"),
    ON_DEMAND: templates.filter((t) => t.cadence === "ON_DEMAND"),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Checklists</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Opening, closing, cleaning, and food-safety checks. Each run is
            logged and timestamped for compliance.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/kitchen"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Monitor className="h-4 w-4" />
            iPad view
          </Link>
          <Link
            href="/checklists/templates/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" />
            New template
          </Link>
        </div>
      </div>

      {overdue.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-red-900">
                  {overdue.length} checklist{overdue.length === 1 ? "" : "s"} overdue
                </div>
                <div className="mt-2 space-y-1">
                  {overdue.slice(0, 6).map((o, i) => (
                    <div
                      key={`${o.templateId}-${o.venue}-${i}`}
                      className="flex items-center justify-between rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{o.templateName}</span>
                        <span className="ml-2 text-muted-foreground">
                          {VENUE_SHORT_LABEL[o.venue]}
                          {o.area ? ` · ${o.area}` : ""} · due by{" "}
                          {String(o.dueByHour).padStart(2, "0")}:00 ·{" "}
                          {o.completedItems}/{o.totalItems} done
                        </span>
                      </div>
                      <Badge variant="red" className="ml-2 shrink-0 text-[10px]">
                        {o.minutesOverdue >= 60
                          ? `${Math.floor(o.minutesOverdue / 60)}h ${o.minutesOverdue % 60}m`
                          : `${o.minutesOverdue}m`}{" "}
                        late
                      </Badge>
                      {o.runId && (
                        <Link
                          href={`/checklists/runs/${o.runId}`}
                          className="ml-2 shrink-0 rounded-md bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700"
                        >
                          Open
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-sm text-muted-foreground">
              No checklist templates yet. Create one to start tracking
              opening, closing, and food-safety tasks.
            </p>
            <div className="mt-4">
              <Link
                href="/checklists/templates/new"
                className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
              >
                <Plus className="h-4 w-4" />
                Create first template
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {(["DAILY", "WEEKLY", "MONTHLY", "ON_DEMAND"] as const).map(
            (cadence) => {
              const rows = grouped[cadence]
              if (rows.length === 0) return null
              return (
                <div key={cadence}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {cadence.replace("_", " ")}
                  </h2>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rows.map((t) => {
                      const completion = t.todayRun
                        ? t.todayRun.totalItems > 0
                          ? Math.round(
                              (t.todayRun.completedItems /
                                t.todayRun.totalItems) *
                                100
                            )
                          : 0
                        : 0
                      const isDone = t.todayRun?.status === "COMPLETED"
                      return (
                        <Card
                          key={t.id}
                          className="overflow-hidden transition-shadow hover:shadow-md"
                        >
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-medium">{t.name}</span>
                                  {t.isFoodSafety && (
                                    <Badge
                                      variant="outline"
                                      className="gap-1 text-[10px]"
                                    >
                                      <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                      HACCP
                                    </Badge>
                                  )}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                                  <span>
                                    {VENUE_SHORT_LABEL[t.venue] ?? t.venue}
                                  </span>
                                  {t.area && <span>· {t.area}</span>}
                                  <span>· {t.shift.toLowerCase()} shift</span>
                                  <span>· {t.itemCount} items</span>
                                </div>
                              </div>
                              {isDone ? (
                                <Badge variant="green" className="gap-1 text-[10px]">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Done
                                </Badge>
                              ) : t.todayRun ? (
                                <Badge variant="amber" className="gap-1 text-[10px]">
                                  <Clock className="h-3 w-3" />
                                  {completion}%
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  Not started
                                </Badge>
                              )}
                            </div>

                            {t.todayRun && (
                              <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                                <div
                                  className={
                                    isDone
                                      ? "h-full bg-emerald-500"
                                      : "h-full bg-amber-500"
                                  }
                                  style={{ width: `${completion}%` }}
                                />
                              </div>
                            )}

                            <div className="mt-3 flex items-center gap-2">
                              {t.todayRun ? (
                                <Link
                                  href={`/checklists/runs/${t.todayRun.id}`}
                                  className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-center text-xs font-medium text-gray-700 hover:bg-gray-50"
                                >
                                  {isDone ? "View" : "Continue"}
                                </Link>
                              ) : (
                                <ChecklistStartButton
                                  templateId={t.id}
                                  defaultVenue={
                                    t.venue === "BOTH" ? "BURLEIGH" : t.venue
                                  }
                                />
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </div>
              )
            }
          )}
        </div>
      )}
    </div>
  )
}
