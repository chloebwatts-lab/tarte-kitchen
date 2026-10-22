"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CreditCard, CheckCircle2, XCircle, ExternalLink } from "lucide-react"
import {
  connectSquare,
  disconnectSquare,
  updateSquareLocationMapping,
  syncSquareNow,
  type SquareStatus,
  type SquareAccount,
} from "@/lib/actions/square"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

/**
 * One card, one block per Square ACCOUNT. Currumbin (Beach House + Tea
 * Garden) and Burleigh (Tarte Bakery) are separate Square accounts, so each
 * needs its own token; once both are pasted every venue shows on the Sales
 * pages without ever switching Square logins.
 */
function TokenForm({ onDone, compact }: { onDone: () => void; compact: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
        <p className="font-medium">{compact ? "Add another Square account (2 minutes):" : "Get a token (2 minutes, same Square login):"}</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>
            Signed in to that account on Square, open the{" "}
            <a
              href="https://developer.squareup.com/apps"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline inline-flex items-center gap-1"
            >
              Square developer dashboard <ExternalLink className="h-3 w-3" />
            </a>{" "}
            and add an application called Tarte Kitchen
          </li>
          <li>Open it, switch the toggle at the top to Production</li>
          <li>Copy the Production Access Token and paste it below</li>
        </ol>
      </div>
      <form
        action={(fd) => {
          setError(null)
          startTransition(async () => {
            const r = await connectSquare(fd)
            if (!r.ok) setError(r.error ?? "Could not connect")
            onDone()
          })
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input
          name="token"
          type="password"
          autoComplete="off"
          placeholder="Production access token"
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          required
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Checking…" : compact ? "Add account" : "Connect Square"}
        </Button>
      </form>
      {error && (
        <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">
          {error}
        </div>
      )}
    </div>
  )
}

function AccountBlock({ account, onChanged }: { account: SquareAccount; onChanged: () => void }) {
  const [isPending, startTransition] = useTransition()
  const healthy = !account.lastError
  const title = account.merchantName ?? account.merchantId ?? "Square account"
  return (
    <div className="rounded-xl border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium truncate">{title}</p>
          <p className="text-xs text-muted-foreground">
            {account.locations.map((l) => l.name).join(", ") || "No locations"}
          </p>
        </div>
        <Badge
          className={
            healthy
              ? "border-green-text/20 bg-green-light text-green-text"
              : "border-red-text/20 bg-red-light text-red-text"
          }
        >
          {healthy ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <span className="ml-1">{healthy ? "Connected" : "Last sync failed"}</span>
        </Badge>
      </div>

      {account.locations.length > 0 && (
        <div className="space-y-2">
          {account.locations.map((loc) => (
            <div
              key={loc.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
            >
              <span className="truncate flex-1">{loc.name}</span>
              <Select
                value={loc.venue}
                onValueChange={(newVenue) => {
                  startTransition(async () => {
                    await updateSquareLocationMapping(
                      account.id,
                      account.locations.map((l) => (l.id === loc.id ? { ...l, venue: newVenue } : l))
                    )
                    onChanged()
                  })
                }}
              >
                <SelectTrigger className="h-8 w-[200px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SINGLE_VENUES.map((v) => (
                    <SelectItem key={v} value={v}>
                      {VENUE_LABEL[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Connected {new Date(account.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}.{" "}
        {account.lastSyncAt
          ? <>Last sync {new Date(account.lastSyncAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}.</>
          : "Not synced yet."}
      </p>

      {account.lastError && (
        <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">
          {account.lastError}
        </div>
      )}

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          startTransition(async () => {
            await disconnectSquare(account.id)
            onChanged()
          })
        }
        disabled={isPending}
      >
        Disconnect this account
      </Button>
    </div>
  )
}

export function SquareConnection({ status }: { status: SquareStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const refresh = () => router.refresh()

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Square POS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Square is the till at every venue. Currumbin (Beach House + Tea Garden) and
            Burleigh are separate Square accounts: connect each one here and all three
            venues show on the Sales pages with item-level sales, today&apos;s running total
            and the processing fees per day.
          </p>
          <TokenForm compact={false} onDone={refresh} />
        </CardContent>
      </Card>
    )
  }

  const missing = status.unmappedVenues
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Square POS
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {status.accounts.length} account{status.accounts.length === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.accounts.map((a) => (
          <AccountBlock key={a.id} account={a} onChanged={refresh} />
        ))}

        {missing.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Not connected yet: {missing.map((v) => VENUE_LABEL[v]).join(", ")}. Add that venue&apos;s Square account below.
          </div>
        )}

        {adding || missing.length > 0 ? (
          <TokenForm compact onDone={() => { setAdding(false); refresh() }} />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
            Add another Square account
          </Button>
        )}

        {syncNote && <p className="text-xs text-muted-foreground">{syncNote}</p>}

        <Button
          onClick={() =>
            startTransition(async () => {
              setSyncNote(null)
              const r = await syncSquareNow(2)
              setSyncNote(
                r.ok
                  ? `Synced: ${r.results.filter((x) => !x.skipped).map((x) => `${x.venue} ${x.date} $${x.totalIncGst.toFixed(0)} (${x.items} items)`).join("; ")}`
                  : `Sync failed: ${r.error}`
              )
              refresh()
            })
          }
          disabled={isPending}
        >
          {isPending ? "Syncing…" : "Sync yesterday + today"}
        </Button>
      </CardContent>
    </Card>
  )
}
