export const dynamic = "force-dynamic"

import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react"
import {
  listInboxPlaybooks,
  listRecentInboxRuns,
  listRecentInboxLearnings,
} from "@/lib/actions/inbox-playbooks"
import { InboxPlaybookEditor } from "@/components/inbox-playbook-editor"

const GROUP_ORDER = ["Events", "Operations", "Other"] as const

const CATEGORY_GROUP: Record<string, (typeof GROUP_ORDER)[number]> = {
  events_tea_garden_high_tea: "Events",
  events_tea_garden_functions: "Events",
  events_beach_house_functions: "Events",
  suppliers: "Operations",
  reviews: "Operations",
  bookings_dine_in: "Operations",
  job_applications: "Operations",
  marketing_cold_outreach: "Other",
  accounts_invoices: "Other",
  needs_human: "Other",
}

function fmtTime(d: Date) {
  return new Date(d).toLocaleString("en-AU", {
    timeZone: "Australia/Brisbane",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

function fmtRelative(d: Date): string {
  const ms = Date.now() - new Date(d).getTime()
  const mins = Math.round(ms / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? "" : "s"} ago`
  const days = Math.round(hrs / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

export default async function InboxPlaybooksPage() {
  const [playbooks, runs, learnings] = await Promise.all([
    listInboxPlaybooks(),
    listRecentInboxRuns(20),
    listRecentInboxLearnings(15),
  ])

  const lastRun = runs[0]
  const lastErrorRun = runs.find((r) => r.error)
  const totalSeen = runs.reduce((s, r) => s + (r.threads_seen ?? 0), 0)
  const totalActed = runs.reduce((s, r) => s + (r.threads_acted ?? 0), 0)
  const errorRate = runs.length
    ? runs.filter((r) => r.error).length / runs.length
    : 0

  const anyAutoSend = playbooks.some((p) => p.auto_send)

  // Group by section
  const grouped = new Map<string, typeof playbooks>()
  for (const g of GROUP_ORDER) grouped.set(g, [])
  for (const p of playbooks) {
    const g = CATEGORY_GROUP[p.category] ?? "Other"
    grouped.get(g)!.push(p)
  }

  return (
    <div className="space-y-6">
      {/* Page intro (layout already provides the branded header) */}
      <div>
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground">
          Playbooks
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How the agent classifies, replies and which categories auto-send.
          The agent reads new mail every ~2 minutes; saved changes take effect on the next tick.
        </p>
      </div>

      {/* Status banner */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Last tick"
          value={lastRun ? fmtRelative(lastRun.started_at) : "—"}
          sub={
            lastRun
              ? `seen ${lastRun.threads_seen} · acted ${lastRun.threads_acted}`
              : "no runs yet"
          }
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Last 20 ticks"
          value={`${totalSeen} / ${totalActed}`}
          sub="threads seen / acted"
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
        />
        <StatCard
          label="Auto-send"
          value={anyAutoSend ? "ON for some" : "OFF (drafts only)"}
          sub={anyAutoSend ? "review the live categories" : "everything drafts"}
          icon={
            anyAutoSend ? (
              <AlertTriangle className="h-4 w-4 text-amber-text" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-green-text" />
            )
          }
          tone={anyAutoSend ? "warning" : "ok"}
        />
      </div>

      {lastErrorRun && (
        <div className="rounded-xl border border-red-text/20 bg-red-light px-4 py-3 text-sm text-red-text">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Recent tick failed
          </div>
          <p className="mt-1 text-xs text-red-text/80">
            {fmtTime(lastErrorRun.started_at)} — {lastErrorRun.error}
          </p>
        </div>
      )}

      {/* Recent edits */}
      {learnings.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Recent edits ({learnings.length})
            <span className="ml-2 normal-case text-muted-foreground font-normal">
              — what humans rewrote before sending
            </span>
          </h2>
          <div className="space-y-2">
            {learnings.map((l) => (
              <details
                key={l.id}
                className="rounded-lg border border-border bg-muted/40 p-2 open:bg-card"
              >
                <summary className="flex cursor-pointer items-center gap-2 text-xs">
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-foreground">
                    {l.category ?? "?"}
                  </span>
                  <span className="text-muted-foreground">
                    edit distance{" "}
                    <span className="font-mono font-medium text-foreground">
                      {l.edit_distance}
                    </span>
                  </span>
                  <span className="ml-auto text-muted-foreground">
                    {fmtRelative(l.noted_at)}
                  </span>
                </summary>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Our draft
                    </p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-amber-light p-2 text-xs leading-relaxed text-foreground ring-1 ring-amber-text/20">
                      {l.our_draft}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1 font-serif text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      What was actually sent
                    </p>
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-green-light p-2 text-xs leading-relaxed text-foreground ring-1 ring-green-text/20">
                      {l.sent_reply}
                    </pre>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {/* Playbooks grouped */}
      {GROUP_ORDER.map((group) => {
        const items = grouped.get(group) ?? []
        if (!items.length) return null
        return (
          <section key={group} className="space-y-2">
            <h2 className="font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {group}
            </h2>
            <div className="space-y-2">
              {items.map((p) => (
                <InboxPlaybookEditor key={p.category} playbook={p} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "default",
}: {
  label: string
  value: string
  sub: string
  icon?: React.ReactNode
  tone?: "default" | "ok" | "warning"
}) {
  const toneClasses =
    tone === "warning"
      ? "border-amber-text/20 bg-amber-light"
      : tone === "ok"
        ? "border-green-text/20 bg-green-light/40"
        : "border-border bg-card"
  return (
    <div className={`rounded-xl border-[1.5px] ${toneClasses} p-4 shadow-sm`}>
      <div className="flex items-center gap-2 font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-serif text-lg font-semibold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  )
}
