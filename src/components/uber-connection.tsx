"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Bike, CheckCircle2, XCircle, ExternalLink } from "lucide-react"
import { connectUber, disconnectUber, updateUberStoreMapping, syncUberNow, type UberStatus } from "@/lib/actions/uber"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

function HowTo() {
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
      <p className="font-medium">Copy the session from Uber Eats Manager (about a minute):</p>
      <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
        <li>
          Open{" "}
          <a href="https://merchants.ubereats.com/manager/home" target="_blank" rel="noopener noreferrer" className="text-primary underline inline-flex items-center gap-1">
            Uber Eats Manager <ExternalLink className="h-3 w-3" />
          </a>{" "}
          in Chrome, logged in as usual
        </li>
        <li>Right-click the page, choose Inspect, then the Network tab, then reload the page</li>
        <li>Click any row that says <span className="font-mono">getTodaySalesMetrics</span> or <span className="font-mono">graphql</span></li>
        <li>Right-click that row, Copy, Copy as cURL, then paste the lot below</li>
      </ol>
      <p className="text-xs text-muted-foreground">Uber has no sales API for shops, so this is the only live route. The session is stored encrypted and never shown again. When Uber logs that session out, this card and the Sales page say so and you paste a fresh one.</p>
    </div>
  )
}

export function UberConnection({ status }: { status: UberStatus }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState<string | null>(null)
  const [showPaste, setShowPaste] = useState(false)

  const pasteForm = (label: string) => (
    <form
      action={(fd) => {
        setError(null)
        startTransition(async () => {
          const r = await connectUber(fd)
          if (!r.ok) setError(r.error ?? "Could not connect")
          else setShowPaste(false)
          router.refresh()
        })
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        name="cookie"
        autoComplete="off"
        placeholder="Paste the Copy as cURL text, or just the cookie: line"
        className="min-h-[90px] w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        required
      />
      <div><Button type="submit" disabled={isPending}>{isPending ? "Checking with Uber…" : label}</Button></div>
    </form>
  )

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5" />Uber Eats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Uber Eats sales (Tarte Takeaway at Currumbin, Tarte Bakery Burleigh) on the Sales insights
            pages: today&apos;s running figure and a line on the week and month charts. Shown beside the
            venue total, never added to it.
          </p>
          <HowTo />
          {pasteForm("Connect Uber Eats")}
          {error && <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">{error}</div>}
        </CardContent>
      </Card>
    )
  }

  const healthy = !status.lastError
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2"><Bike className="h-5 w-5" />Uber Eats</CardTitle>
          <Badge className={healthy ? "border-green-text/20 bg-green-light text-green-text" : "border-red-text/20 bg-red-light text-red-text"}>
            {healthy ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span className="ml-1">{healthy ? "Connected" : "Needs a fresh session"}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.stores.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Shop → Venue mapping</p>
            <div className="space-y-2">
              {status.stores.map((s) => (
                <div key={s.uuid} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                  <span className="truncate flex-1">{s.name}</span>
                  <Select
                    value={s.venue}
                    onValueChange={(venue) => {
                      startTransition(async () => {
                        await updateUberStoreMapping(status.stores.map((x) => (x.uuid === s.uuid ? { ...x, venue } : x)))
                        router.refresh()
                      })
                    }}
                  >
                    <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SINGLE_VENUES.map((v) => <SelectItem key={v} value={v}>{VENUE_LABEL[v]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {status.connectedAt && <>Session pasted {new Date(status.connectedAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })}. </>}
          {status.lastSyncAt
            ? <>Last sync {new Date(status.lastSyncAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}.</>
            : "Not synced yet."}
        </p>

        {status.lastError && <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">{status.lastError}</div>}
        {syncNote && <p className="text-xs text-muted-foreground">{syncNote}</p>}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              startTransition(async () => {
                setSyncNote(null)
                const r = await syncUberNow(14)
                setSyncNote(r.ok ? `Synced: ${r.results.map((x) => `${x.name} ${x.days} days $${x.sales.toFixed(0)} (${x.orders} orders)`).join("; ")}` : `Sync failed: ${r.error}`)
                router.refresh()
              })
            }
            disabled={isPending}
          >
            {isPending ? "Syncing…" : "Sync last 14 days"}
          </Button>
          <Button variant="outline" onClick={() => setShowPaste((v) => !v)} disabled={isPending}>Paste a fresh session</Button>
          <Button variant="outline" onClick={() => startTransition(async () => { await disconnectUber(); router.refresh() })} disabled={isPending}>Disconnect</Button>
        </div>
        {showPaste && (<><HowTo />{pasteForm("Replace session")}</>)}
        {error && <div className="rounded-lg border border-red-text/20 bg-red-light p-3 text-sm text-red-text">{error}</div>}
      </CardContent>
    </Card>
  )
}
