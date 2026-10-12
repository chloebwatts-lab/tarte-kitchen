export const dynamic = "force-dynamic"

import Link from "next/link"
import { getUsageReport } from "@/lib/usage/data"
import { VENUE_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma/client"
import type { PersonUsage } from "@/lib/usage/report"

const WINDOWS = [7, 14, 28]
const MANAGER_TOOLS = ["Line-up", "Morning board", "Jobs board", "Sales insights", "Said + Done"]

const when = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "Australia/Brisbane" })
const whenTime = new Intl.DateTimeFormat("en-AU", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Brisbane" })

function venueLabel(v: string): string {
  return VENUE_LABEL[v as Venue] ?? v
}

function title(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ")
}

function topTools(p: PersonUsage, n = 4): string {
  return Object.entries(p.byTool)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([t, c]) => `${t} ${c}`)
    .join(" · ")
}

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams
  const days = WINDOWS.includes(Number(sp.days)) ? Number(sp.days) : 14
  const r = await getUsageReport(days)
  const idle = r.watched.filter((w) => !w.usage || w.usage.daysActive === 0)
  const th = "px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
  const td = "px-3 py-2 align-top text-sm"

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Who is using Staff tools</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          From the page log (one row each time someone opens a page while signed in as themselves), the
          department orders and the prep sheets. Last{" "}
          {WINDOWS.map((d, i) => (
            <span key={d}>
              {i > 0 ? " · " : ""}
              {d === days ? <strong>{d} days</strong> : <Link className="underline" href={`/settings/usage?days=${d}`}>{d} days</Link>}
            </span>
          ))}
          . {r.totalViews.toLocaleString()} page opens in the window.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">Managers and supervisors</h2>
        {idle.length > 0 ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Not seen in {days} days: <strong>{idle.map((w) => w.who.name).join(", ")}</strong>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Everyone on the list has opened something in the last {days} days.</p>
        )}
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Venue</th>
                <th className={th}>Role</th>
                <th className={th}>Days active</th>
                <th className={th}>Last seen</th>
                {MANAGER_TOOLS.map((t) => (
                  <th key={t} className={th}>{t}</th>
                ))}
                <th className={th}>Other</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.watched.map(({ who, usage }) => {
                const other = usage
                  ? Object.entries(usage.byTool).filter(([t]) => !MANAGER_TOOLS.includes(t)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t, c]) => `${t} ${c}`).join(" · ")
                  : ""
                const quiet = !usage || usage.daysActive === 0
                return (
                  <tr key={`${who.name}|${who.venue ?? ""}`} className={quiet ? "bg-amber-50/60" : ""}>
                    <td className={`${td} font-medium`}>{who.name}</td>
                    <td className={td}>{who.venue ? venueLabel(who.venue) : ""}</td>
                    <td className={td}>{who.role}</td>
                    <td className={td}>{usage ? `${usage.daysActive} of ${days}` : "0"}</td>
                    <td className={td}>{usage?.lastSeen ? whenTime.format(usage.lastSeen) : usage?.lastLogin ? `signed in ${when.format(usage.lastLogin)}, opened nothing` : "never"}</td>
                    {MANAGER_TOOLS.map((t) => (
                      <td key={t} className={`${td} tabular-nums`}>{usage?.byTool[t] ?? ""}</td>
                    ))}
                    <td className={`${td} text-muted-foreground`}>{other}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Names come from the venue team lists and the tier override list. A name with no match in the log has not signed in
          as themselves in the window, or signs in under a different spelling.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">Ordering, by venue and department</h2>
        <p className="text-sm text-muted-foreground">Lines entered on a section&apos;s daily order. A department with no row placed no order through the app.</p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Venue</th>
                <th className={th}>Department</th>
                <th className={th}>Order days</th>
                <th className={th}>Lines</th>
                <th className={th}>Last order</th>
                <th className={th}>Entered by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.orders.length === 0 ? (
                <tr><td className={td} colSpan={6}>No orders through the app in the last {days} days.</td></tr>
              ) : (
                r.orders.map((o) => (
                  <tr key={`${o.venue}|${o.dept}`}>
                    <td className={`${td} font-medium`}>{venueLabel(o.venue)}</td>
                    <td className={td}>{title(o.dept)}</td>
                    <td className={`${td} tabular-nums`}>{o.days} of {days}</td>
                    <td className={`${td} tabular-nums`}>{o.lines}</td>
                    <td className={td}>{o.last ? when.format(o.last) : ""}</td>
                    <td className={td}>{o.people.join(", ") || <span className="text-muted-foreground">no name recorded</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">Prep list, by venue and station</h2>
        <p className="text-sm text-muted-foreground">Closing counts started and submitted on the prep list.</p>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Venue</th>
                <th className={th}>Station</th>
                <th className={th}>Sheets</th>
                <th className={th}>Submitted</th>
                <th className={th}>Last</th>
                <th className={th}>Counted by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.restock.length === 0 ? (
                <tr><td className={td} colSpan={6}>No prep counts in the last {days} days.</td></tr>
              ) : (
                r.restock.map((o) => (
                  <tr key={`${o.venue}|${o.station}`}>
                    <td className={`${td} font-medium`}>{venueLabel(o.venue)}</td>
                    <td className={td}>{title(o.station)}</td>
                    <td className={`${td} tabular-nums`}>{o.sheets}</td>
                    <td className={`${td} tabular-nums`}>{o.submitted}</td>
                    <td className={td}>{o.last ? when.format(o.last) : ""}</td>
                    <td className={td}>{o.people.join(", ") || <span className="text-muted-foreground">no name recorded</span>}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold">Everyone who signed in</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted/50">
              <tr>
                <th className={th}>Name</th>
                <th className={th}>Days active</th>
                <th className={th}>Sign-ins</th>
                <th className={th}>Page opens</th>
                <th className={th}>Last seen</th>
                <th className={th}>Most used</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.everyone.length === 0 ? (
                <tr><td className={td} colSpan={6}>Nobody has signed in as themselves in the last {days} days.</td></tr>
              ) : (
                r.everyone.map((p) => (
                  <tr key={p.key}>
                    <td className={`${td} font-medium`}>{p.name}</td>
                    <td className={`${td} tabular-nums`}>{p.daysActive}</td>
                    <td className={`${td} tabular-nums`}>{p.logins}</td>
                    <td className={`${td} tabular-nums`}>{p.views}</td>
                    <td className={td}>{p.lastSeen ? whenTime.format(p.lastSeen) : p.lastLogin ? `signed in ${when.format(p.lastLogin)}` : ""}</td>
                    <td className={`${td} text-muted-foreground`}>{topTools(p)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
