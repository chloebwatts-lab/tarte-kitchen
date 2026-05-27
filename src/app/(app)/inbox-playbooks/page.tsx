export const dynamic = "force-dynamic"

import { listInboxPlaybooks, listRecentInboxRuns, listRecentInboxLearnings } from "@/lib/actions/inbox-playbooks"
import { InboxPlaybookEditor } from "@/components/inbox-playbook-editor"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function InboxPlaybooksPage() {
  const [playbooks, runs, learnings] = await Promise.all([
    listInboxPlaybooks(),
    listRecentInboxRuns(10),
    listRecentInboxLearnings(10),
  ])

  const lastRun = runs[0]
  const totalSeen = runs.reduce((s, r) => s + (r.threads_seen ?? 0), 0)
  const totalActed = runs.reduce((s, r) => s + (r.threads_acted ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Inbox Playbooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure how the hello@tarte.com.au email agent classifies, replies and which categories auto-send.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {lastRun ? (
            <p>
              Last tick:{" "}
              <span className="font-medium">
                {new Date(lastRun.started_at).toLocaleString("en-AU", {
                  timeZone: "Australia/Brisbane",
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              </span>{" "}
              — seen {lastRun.threads_seen}, acted on {lastRun.threads_acted}
              {lastRun.error ? (
                <span className="text-destructive"> (error: {lastRun.error})</span>
              ) : null}
            </p>
          ) : (
            <p className="text-muted-foreground">No runs yet.</p>
          )}
          <p className="text-muted-foreground">
            Last {runs.length} ticks: {totalSeen} threads seen, {totalActed} acted on.
          </p>
        </CardContent>
      </Card>

      {learnings.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recent edits (humans rewrote our drafts)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            {learnings.map((l) => (
              <details key={l.id} className="rounded-md border p-2">
                <summary className="cursor-pointer">
                  {l.category ?? "?"} — edit distance {l.edit_distance} —{" "}
                  {new Date(l.noted_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}
                </summary>
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  <div>
                    <p className="font-semibold">Our draft</p>
                    <pre className="whitespace-pre-wrap font-mono">{l.our_draft}</pre>
                  </div>
                  <div>
                    <p className="font-semibold">What was actually sent</p>
                    <pre className="whitespace-pre-wrap font-mono">{l.sent_reply}</pre>
                  </div>
                </div>
              </details>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-4">
        {playbooks.map((p) => (
          <InboxPlaybookEditor key={p.category} playbook={p} />
        ))}
      </div>
    </div>
  )
}
