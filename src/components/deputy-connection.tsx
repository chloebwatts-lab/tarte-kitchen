"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Users,
  ExternalLink,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Unplug,
  AlertTriangle,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  refreshDeputyLocations,
  setDeputyLocationVenue,
  setDeputyWageSettings,
  triggerDeputySync,
  disconnectDeputy,
  connectDeputyWithToken,
  type DeputyStatus,
} from "@/lib/actions/deputy"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import type { Venue } from "@/generated/prisma"

interface Props {
  status: DeputyStatus
  configured: boolean
}

export function DeputyConnection({ status, configured }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [tokenInput, setTokenInput] = useState("")
  const [installInput, setInstallInput] = useState("")
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [superPct, setSuperPct] = useState(
    (status.superRate * 100).toFixed(2)
  )
  const [openRate, setOpenRate] = useState(
    status.defaultOpenShiftRate.toFixed(2)
  )
  const [upliftPct, setUpliftPct] = useState(
    (status.onCostUpliftRate * 100).toFixed(2)
  )
  const [wageSaveMsg, setWageSaveMsg] = useState<string | null>(null)

  function handleConnectWithToken() {
    setTokenError(null)
    if (!tokenInput.trim() || !installInput.trim()) {
      setTokenError("Both the token and install URL are required")
      return
    }
    startTransition(async () => {
      try {
        await connectDeputyWithToken({
          token: tokenInput,
          installUrl: installInput,
        })
        setTokenInput("")
        setInstallInput("")
        router.refresh()
      } catch (e) {
        setTokenError((e as Error).message)
      }
    })
  }

  function handleRefreshLocations() {
    startTransition(async () => {
      try {
        const n = await refreshDeputyLocations()
        setSyncResult(`Refreshed — ${n} locations found`)
      } catch (e) {
        setSyncResult(`Error: ${(e as Error).message}`)
      }
      router.refresh()
    })
  }

  function handleSync() {
    startTransition(async () => {
      try {
        const r = await triggerDeputySync()
        setSyncResult(
          `Synced — ${r.upserted} shifts (${r.skipped} skipped, no venue mapping)`
        )
      } catch (e) {
        setSyncResult(`Error: ${(e as Error).message}`)
      }
      router.refresh()
    })
  }

  function handleSetVenue(opUnitId: number, venue: string) {
    startTransition(async () => {
      await setDeputyLocationVenue({
        opUnitId,
        venue: venue === "NONE" ? null : (venue as Venue),
      })
      router.refresh()
    })
  }

  function handleSaveWageSettings() {
    setWageSaveMsg(null)
    const superDec = Number(superPct) / 100
    const openDollars = Number(openRate)
    const upliftDec = Number(upliftPct) / 100
    if (!Number.isFinite(superDec) || superDec < 0 || superDec > 1) {
      setWageSaveMsg("Super % must be between 0 and 100")
      return
    }
    if (!Number.isFinite(openDollars) || openDollars < 0) {
      setWageSaveMsg("Open shift rate must be a non-negative number")
      return
    }
    if (!Number.isFinite(upliftDec) || upliftDec < 0 || upliftDec > 1) {
      setWageSaveMsg("On-cost uplift % must be between 0 and 100")
      return
    }
    startTransition(async () => {
      try {
        await setDeputyWageSettings({
          superRate: superDec,
          defaultOpenShiftRate: openDollars,
          onCostUpliftRate: upliftDec,
        })
        setWageSaveMsg("Saved")
      } catch (e) {
        setWageSaveMsg((e as Error).message)
      }
      router.refresh()
    })
  }

  function handleDisconnect() {
    if (!confirm("Disconnect Deputy? Labour data stays — just stops syncing."))
      return
    startTransition(async () => {
      await disconnectDeputy()
      router.refresh()
    })
  }

  // -------------------- Not connected --------------------
  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Deputy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Syncs timesheets from Deputy so you get daily labour % per venue,
            biggest-labour-day alerts, and per-employee cost breakdowns.
          </p>

          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm">
            <p className="font-medium">How to get a Permanent Token (60 seconds):</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>
                Open your Deputy install and sign in as the account owner.
              </li>
              <li>
                Click your avatar (top-right) →{" "}
                <strong>My Account</strong>.
              </li>
              <li>
                Sidebar → <strong>Integrations</strong> (some installs label
                this <strong>Developer Tools</strong> or{" "}
                <strong>API / Permanent Tokens</strong>).
              </li>
              <li>
                <strong>Create New Permanent Token</strong> → name it{" "}
                &ldquo;Tarte Kitchen&rdquo; → copy the token.
              </li>
              <li>Paste below, along with your Deputy install URL.</li>
            </ol>
          </div>

          <div className="space-y-3 rounded-lg border-2 border-dashed border-gray-300 bg-white p-4">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Deputy install URL
              </label>
              <input
                value={installInput}
                onChange={(e) => setInstallInput(e.target.value)}
                placeholder="tarte.au.deputy.com"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                The address bar when you&apos;re logged into Deputy.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Permanent Token
              </label>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                type="password"
                placeholder="eyJ0eXAi… (long string)"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Encrypted at rest. Only decrypted server-side when syncing.
              </p>
            </div>
            <Button
              onClick={handleConnectWithToken}
              disabled={isPending}
            >
              {isPending ? "Verifying…" : "Connect Deputy"}
            </Button>
            {tokenError && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-700">
                {tokenError}
              </div>
            )}
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Advanced: use OAuth (requires a developer app)
            </summary>
            <div className="mt-2 rounded-md border border-border bg-muted/30 p-3">
              {configured ? (
                <a
                  href="/api/deputy/auth"
                  className="inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
                >
                  Connect via OAuth
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : (
                <p>
                  Add <code className="rounded bg-muted px-1">DEPUTY_CLIENT_ID</code> +{" "}
                  <code className="rounded bg-muted px-1">DEPUTY_CLIENT_SECRET</code>{" "}
                  to the droplet env first.
                </p>
              )}
            </div>
          </details>
        </CardContent>
      </Card>
    )
  }

  // -------------------- Connected --------------------
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Deputy
          </CardTitle>
          <Badge
            className={
              status.tokenHealthy
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }
          >
            {status.tokenHealthy ? (
              <>
                <CheckCircle2 className="mr-1 h-3 w-3" /> Connected
              </>
            ) : (
              <>
                <XCircle className="mr-1 h-3 w-3" /> Reauth needed
              </>
            )}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
          <div className="grid grid-cols-[90px_1fr] gap-y-1">
            <span className="text-muted-foreground">Install</span>
            <span className="font-medium">
              {status.install}.{status.region}.deputy.com
            </span>
            <span className="text-muted-foreground">Last sync</span>
            <span className="font-medium">
              {status.lastSyncedAt
                ? new Date(status.lastSyncedAt).toLocaleString("en-AU")
                : "—"}
            </span>
          </div>
        </div>

        {/* Location mapping */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Location mapping</div>
              <div className="text-xs text-muted-foreground">
                Point each Deputy location at a Tarte venue. Unmapped
                locations are skipped when syncing timesheets.
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefreshLocations}
              disabled={isPending}
            >
              <RefreshCw
                className={`mr-1 h-3 w-3 ${isPending ? "animate-spin" : ""}`}
              />
              Refresh from Deputy
            </Button>
          </div>

          {status.unmappedCount > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline h-3 w-3" />
              {status.unmappedCount} location{status.unmappedCount === 1 ? "" : "s"}{" "}
              unmapped. Timesheets from these will be skipped until you pick a venue.
            </div>
          )}

          {status.locations && status.locations.length > 0 ? (
            <div className="space-y-1">
              {status.locations.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{l.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Deputy id: {l.id}
                    </div>
                  </div>
                  <Select
                    value={l.venue ?? "NONE"}
                    onValueChange={(v) => handleSetVenue(l.id, v)}
                  >
                    <SelectTrigger className="h-8 w-[180px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">— Unmapped —</SelectItem>
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
          ) : (
            <div className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
              No locations loaded yet — click &ldquo;Refresh from Deputy&rdquo;.
            </div>
          )}
        </div>

        {/* Wage settings */}
        <div className="space-y-2 border-t border-border pt-4">
          <div>
            <div className="text-sm font-medium">Wage settings</div>
            <div className="text-xs text-muted-foreground">
              Stacked on top of Deputy&apos;s Cost/OnCost. The on-cost
              uplift captures workers&apos; comp + payroll tax, which
              Deputy&apos;s Insights page shows but its API doesn&apos;t
              expose. Tune to match the Insights total to the cent.
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium">
                Super %
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                value={superPct}
                onChange={(e) => setSuperPct(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                On-cost uplift %
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={upliftPct}
                onChange={(e) => setUpliftPct(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Workers&apos; comp + payroll tax
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">
                Open shift $/hr
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={openRate}
                onChange={(e) => setOpenRate(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSaveWageSettings}
              disabled={isPending}
            >
              Save wage settings
            </Button>
            {wageSaveMsg && (
              <span className="text-xs text-muted-foreground">
                {wageSaveMsg}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleSync} disabled={isPending}>
            <RefreshCw
              className={`mr-1 h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`}
            />
            Sync timesheets now
          </Button>
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            <Unplug className="mr-1 h-3.5 w-3.5" />
            Disconnect
          </Button>
        </div>

        {syncResult && (
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
            {syncResult}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
