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
} from "@/lib/actions/square"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function SquareConnection({ status }: { status: SquareStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)

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
            Square is the till at Beach House and Tea Gardens from 1 Oct 2026 (Burleigh
            follows). Connecting the API gives item-level sales, today&apos;s running total
            and the processing fees per day.
          </p>
          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-medium">Get a token (2 minutes, same Square login):</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Open the{" "}
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
                router.refresh()
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
              {isPending ? "Checking…" : "Connect Square"}
            </Button>
          </form>
          {error && (
            <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">
              {error}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  const healthy = !status.lastError
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Square POS
          </CardTitle>
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
      </CardHeader>
      <CardContent className="space-y-4">
        {status.locations.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Location → Venue mapping</p>
            <div className="space-y-2">
              {status.locations.map((loc) => (
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
                          status.locations.map((l) => (l.id === loc.id ? { ...l, venue: newVenue } : l))
                        )
                        router.refresh()
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
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {status.connectedAt && (
            <>Connected {new Date(status.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. </>
          )}
          {status.lastSyncAt
            ? <>Last sync {new Date(status.lastSyncAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}.</>
            : "Not synced yet."}
        </p>

        {status.lastError && (
          <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">
            {status.lastError}
          </div>
        )}
        {syncNote && <p className="text-xs text-muted-foreground">{syncNote}</p>}

        <div className="flex gap-2">
          <Button
            onClick={() =>
              startTransition(async () => {
                setSyncNote(null)
                const r = await syncSquareNow(2)
                setSyncNote(
                  r.ok
                    ? `Synced: ${r.results.map((x) => `${x.venue} ${x.date} $${x.totalIncGst.toFixed(0)} (${x.items} items)`).join("; ")}`
                    : `Sync failed: ${r.error}`
                )
                router.refresh()
              })
            }
            disabled={isPending}
          >
            {isPending ? "Syncing…" : "Sync yesterday + today"}
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              startTransition(async () => {
                await disconnectSquare()
                router.refresh()
              })
            }
            disabled={isPending}
          >
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
