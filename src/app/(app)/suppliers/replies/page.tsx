export const dynamic = "force-dynamic"

import Link from "next/link"
import { ArrowLeft, ExternalLink, Inbox, RefreshCw } from "lucide-react"
import { getSupplierReplies } from "@/lib/actions/supplier-replies"

export default async function SupplierRepliesPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>
}) {
  const sp = await searchParams
  const daysBack = clampDays(sp.days)
  const data = await getSupplierReplies({ daysBack })

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/suppliers"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to suppliers
        </Link>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight">
              Recent supplier replies
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Emails from supplier-domain addresses in the last {daysBack} days.
              Quote replies typically come from the same domain as the supplier
              we order from — anything outside that domain is filtered.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30].map((d) => (
              <Link
                key={d}
                href={`/suppliers/replies?days=${d}`}
                className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
                  d === daysBack
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted/50"
                }`}
              >
                {d}d
              </Link>
            ))}
            <Link
              href={`/suppliers/replies?days=${daysBack}`}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/50"
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Link>
          </div>
        </div>
      </div>

      {!data.connected ? (
        <NoConnection />
      ) : data.error ? (
        <ErrorBanner message={data.error} />
      ) : data.domainsSearched.length === 0 ? (
        <EmptyBanner
          title="No supplier domains to search"
          body="Add an email address to each supplier in /suppliers before this page can match anything."
        />
      ) : data.replies.length === 0 ? (
        <EmptyBanner
          title={`Nothing from suppliers in the last ${daysBack} days`}
          body={`Searched ${data.domainsSearched.length} domains via ${data.account}.`}
        />
      ) : (
        <RepliesTable
          replies={data.replies}
          account={data.account}
          domainsSearched={data.domainsSearched}
        />
      )}
    </div>
  )
}

function clampDays(raw: string | undefined): number {
  const n = raw ? parseInt(raw, 10) : 14
  if (!Number.isFinite(n) || n < 1) return 14
  if (n > 90) return 90
  return n
}

function NoConnection() {
  return (
    <div className="rounded-lg border border-amber-text/20 bg-amber-light p-4 text-sm text-amber-text">
      <div className="flex items-center gap-2 font-medium">
        <Inbox className="h-4 w-4" />
        Gmail not connected
      </div>
      <p className="mt-1.5">
        Connect a Gmail account at{" "}
        <Link
          className="underline"
          href="/settings/integrations"
        >
          Settings → Integrations
        </Link>{" "}
        — once connected, supplier replies show up here automatically.
      </p>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-text/20 bg-red-light p-4 text-sm text-red-text">
      <p className="font-medium">Gmail search failed</p>
      <p className="mt-1 font-mono text-xs leading-snug">{message}</p>
      <p className="mt-2 text-xs">
        Common cause is an expired refresh token — reconnect at{" "}
        <Link className="underline" href="/settings/integrations">
          Settings → Integrations
        </Link>
        .
      </p>
    </div>
  )
}

function EmptyBanner({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1.5 text-muted-foreground">{body}</p>
    </div>
  )
}

function RepliesTable({
  replies,
  account,
  domainsSearched,
}: {
  replies: { messageId: string; threadId: string; sentAt: string; fromName: string | null; fromEmail: string | null; supplierName: string | null; subject: string | null; snippet: string; gmailUrl: string }[]
  account: string | null
  domainsSearched: string[]
}) {
  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        {replies.length} message{replies.length === 1 ? "" : "s"} · scanning{" "}
        {account ?? "—"} · {domainsSearched.length} supplier domain
        {domainsSearched.length === 1 ? "" : "s"}
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left font-serif text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Received</th>
              <th className="px-3 py-2 font-semibold">Supplier</th>
              <th className="px-3 py-2 font-semibold">From</th>
              <th className="px-3 py-2 font-semibold">Subject &amp; snippet</th>
              <th className="px-3 py-2 font-semibold"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {replies.map((r) => (
              <tr key={r.messageId} className="align-top">
                <td className="whitespace-nowrap px-3 py-3 text-xs text-muted-foreground">
                  {new Date(r.sentAt).toLocaleString("en-AU", {
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                    timeZone: "Australia/Brisbane",
                  })}
                </td>
                <td className="px-3 py-3 text-xs">
                  {r.supplierName ?? (
                    <span className="text-muted-foreground/60">—</span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  <div className="font-medium text-foreground">
                    {r.fromName ?? r.fromEmail ?? "—"}
                  </div>
                  {r.fromName && r.fromEmail && (
                    <div className="text-muted-foreground">{r.fromEmail}</div>
                  )}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-foreground">
                    {r.subject ?? <span className="italic text-muted-foreground/60">(no subject)</span>}
                  </div>
                  {r.snippet && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {r.snippet}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <a
                    href={r.gmailUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted/50"
                  >
                    Open
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
