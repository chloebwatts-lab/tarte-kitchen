import Link from "next/link"
import { CheckCircle2, AlertTriangle, Users, ClipboardList } from "lucide-react"
import type { OverdueRun } from "@/lib/actions/checklist-alerts"
import type { LiveWeekLabourVenue } from "@/lib/actions/labour"
import { VENUE_SHORT_LABEL } from "@/lib/venues"

interface ChecklistSnapshot {
  totalTemplates: number
  totalIncomplete: number
}

function labourColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground"
  if (pct <= 38) return "text-green-text"
  if (pct <= 42) return "text-amber-text"
  return "text-red-text"
}

function labourBg(pct: number | null): string {
  if (pct === null) return ""
  if (pct <= 38) return "bg-green-light"
  if (pct <= 42) return "bg-amber-light"
  return "bg-red-light"
}

export function DashboardOpsPanel({
  checklists,
  overdue,
  labour,
}: {
  checklists: ChecklistSnapshot
  overdue: OverdueRun[]
  labour: LiveWeekLabourVenue[]
}) {
  const done = checklists.totalTemplates - checklists.totalIncomplete
  const total = checklists.totalTemplates
  const allDone = done >= total && total > 0
  const completionPct = total > 0 ? Math.round((done / total) * 100) : 0

  const labourVenues = labour.filter((v) => v.labourPct !== null || v.mForecast !== null)

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* ── Checklists today ─────────────────────────────────────────── */}
      <Link
        href="/checklists"
        className={`group rounded-xl border p-4 transition hover:shadow-sm ${
          overdue.length > 0
            ? "border-red-text/20 bg-red-light"
            : allDone
              ? "border-green-text/20 bg-green-light"
              : "border-border bg-card"
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-1.5 font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              Checklists today
            </div>
            <div className="mt-1 font-serif text-3xl font-semibold tabular-nums">
              {done}
              <span className="text-lg font-normal text-muted-foreground">/{total}</span>
            </div>
            {overdue.length > 0 ? (
              <div className="mt-1 flex items-center gap-1 text-sm font-medium text-red-text">
                <AlertTriangle className="h-3.5 w-3.5" />
                {overdue.length} overdue
              </div>
            ) : allDone ? (
              <div className="mt-1 flex items-center gap-1 text-sm font-medium text-green-text">
                <CheckCircle2 className="h-3.5 w-3.5" />
                All done
              </div>
            ) : (
              <div className="mt-1 text-sm text-muted-foreground">
                {checklists.totalIncomplete} remaining
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="font-serif text-2xl font-semibold tabular-nums text-muted-foreground">
              {completionPct}%
            </div>
          </div>
        </div>
        {total > 0 && (
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-border">
            <div
              className={`h-full transition-all ${
                overdue.length > 0
                  ? "bg-red-text"
                  : allDone
                    ? "bg-green-text"
                    : "bg-amber-text"
              }`}
              style={{ width: `${completionPct}%` }}
            />
          </div>
        )}
      </Link>

      {/* ── Labour % this week ───────────────────────────────────────── */}
      <Link
        href="/labour"
        className="group rounded-xl border border-border bg-card p-4 transition hover:shadow-sm"
      >
        <div className="flex items-center gap-1.5 font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Labour % this week
        </div>

        {labourVenues.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            No forecast entered yet — set in Labour &rarr; Forecasts
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {labourVenues.map((v) => (
              <div key={v.venue} className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  {VENUE_SHORT_LABEL[v.venue]}
                  {v.hasActuals && (
                    <span className="ml-1 text-[10px] text-muted-foreground">(actual)</span>
                  )}
                </span>
                {v.labourPct !== null ? (
                  <span
                    className={`rounded px-2 py-0.5 text-sm font-semibold tabular-nums ${labourColor(v.labourPct)} ${labourBg(v.labourPct)}`}
                  >
                    {v.labourPct.toFixed(1)}%
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </div>
            ))}
          </div>
        )}

        {labourVenues.length > 0 && (
          <p className="mt-3 text-[10px] text-muted-foreground">
            {labour.some((v) => v.hasActuals) ? "Based on uploaded actuals" : "Based on roster vs forecast"}
          </p>
        )}
      </Link>
    </div>
  )
}
