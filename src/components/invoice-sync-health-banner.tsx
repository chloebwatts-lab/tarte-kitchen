import { db } from "@/lib/db"
import { AlertTriangle, CheckCircle2 } from "lucide-react"

/**
 * Surfaces a red banner on the dashboard whenever the supplier-invoice
 * cron looks unhealthy. Three triggers:
 *   - latest run >36h ago (cron stuck or container fell over)
 *   - latest run errored (healthy=false)
 *   - 3+ consecutive runs with messagesFound>0 but invoicesIngested=0
 *     (i.e. we're seeing emails but parsing/ingestion silently fails)
 *
 * Hidden when everything's green so it doesn't add noise.
 */
export async function InvoiceSyncHealthBanner() {
  const runs = await db.invoiceSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 10,
  })

  if (runs.length === 0) {
    return null
  }

  const latest = runs[0]
  const hoursSince = (Date.now() - latest.startedAt.getTime()) / 3_600_000

  const issues: string[] = []
  if (hoursSince > 36) {
    issues.push(
      `Last invoice sync ran ${hoursSince.toFixed(0)}h ago — cron may be stuck.`
    )
  }
  if (latest.finishedAt && !latest.healthy) {
    issues.push(
      `Last run errored: ${latest.errorSummary?.slice(0, 200) ?? "see InvoiceSyncRun row"}.`
    )
  }
  // 3 consecutive runs that saw mail but ingested nothing — strong
  // signal of a parse / mapping / auth regression.
  const recent = runs.slice(0, 3)
  if (
    recent.length === 3 &&
    recent.every((r) => r.messagesFound > 0 && r.invoicesIngested === 0)
  ) {
    issues.push(
      `3 consecutive runs found mail but ingested nothing — check the parser / supplier-email map.`
    )
  }

  if (issues.length === 0) {
    // Quiet success state — only show on the /suppliers page, not the
    // main dashboard. Returning null keeps the dashboard clean.
    return null
  }

  return (
    <div className="rounded-lg border border-red-300 bg-red-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" />
        <div className="flex-1 space-y-1">
          <div className="text-sm font-semibold text-red-900">
            Supplier-invoice ingestion needs attention
          </div>
          <ul className="list-disc pl-5 text-sm text-red-800">
            {issues.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <div className="pt-1 text-xs text-red-700">
            Last 10 runs · {runs.filter((r) => r.healthy).length} healthy ·{" "}
            {runs.reduce((s, r) => s + r.invoicesIngested, 0)} invoices total ·{" "}
            mode {latest.mode}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact green tick variant for the /suppliers page. Same data source,
 * always rendered (success or failure) so the operator has a visible
 * "yes the pipeline is working" confirmation without having to ssh.
 */
export async function InvoiceSyncHealthBadge() {
  const runs = await db.invoiceSyncRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 3,
  })
  if (runs.length === 0) {
    return (
      <div className="rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
        Invoice sync: no runs recorded yet
      </div>
    )
  }
  const latest = runs[0]
  const hoursSince = (Date.now() - latest.startedAt.getTime()) / 3_600_000
  const ok = latest.healthy && hoursSince < 36
  const Icon = ok ? CheckCircle2 : AlertTriangle
  return (
    <div
      className={`rounded-md border px-3 py-2 text-xs ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-red-300 bg-red-50 text-red-800"
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5" />
        <span className="font-semibold">
          Invoice sync {ok ? "healthy" : "needs attention"}
        </span>
        <span className="text-stone-500">·</span>
        <span>
          last run {latest.mode} {hoursSince < 1 ? "<1h" : `${hoursSince.toFixed(0)}h`} ago ·{" "}
          {latest.invoicesIngested} ingested, {latest.errors} errors
        </span>
      </div>
    </div>
  )
}
