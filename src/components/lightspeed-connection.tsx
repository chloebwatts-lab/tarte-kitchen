"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zap, Unplug, ExternalLink, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { disconnectLightspeed, updateLocationVenueMapping, type ConnectionStatus } from "@/lib/actions/lightspeed"
import type { ConnectionStatus as ConnStatus } from "@/lib/lightspeed/token"
import { VENUE_LABEL, SINGLE_VENUES } from "@/lib/venues"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  status: ConnStatus
}

export function LightspeedConnection({ status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch("/api/auth/lightspeed", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setConnecting(false)
    }
  }

  function handleDisconnect() {
    startTransition(async () => {
      await disconnectLightspeed()
      router.refresh()
    })
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lightspeed POS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Lightspeed POS to automatically sync daily sales data
            across Tarte Bakery, Beach House, and Tea Garden. This enables
            theoretical COGS tracking and waste analysis.
          </p>

          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-medium">Before connecting:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Apply for Lightspeed API access via the{" "}
                <a
                  href="https://api-portal.lsk.lightspeed.app/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  Developer Portal <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Register Tarte Kitchen as an application</li>
              <li>Set the redirect URI to your kitchen domain callback URL</li>
              <li>Add the Client ID and Secret to your environment variables</li>
            </ol>
          </div>

          {process.env.NEXT_PUBLIC_LIGHTSPEED_CONFIGURED === "true" ? (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Redirecting..." : "Connect Lightspeed"}
            </Button>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Lightspeed OAuth credentials are not configured. Add{" "}
              <code className="rounded bg-amber-100 px-1">LIGHTSPEED_CLIENT_ID</code> and{" "}
              <code className="rounded bg-amber-100 px-1">LIGHTSPEED_CLIENT_SECRET</code>{" "}
              to your environment variables to enable this integration.
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  // Connected state
  const healthIcon = status.tokenHealthy ? (
    <CheckCircle2 className="h-4 w-4 text-green-600" />
  ) : (
    <XCircle className="h-4 w-4 text-red-600" />
  )

  const healthLabel = status.tokenHealthy ? "Connected" : "Auth expired"
  const healthColor = status.tokenHealthy ? "green" : "red"

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Lightspeed POS
          </CardTitle>
          <Badge
            className={
              healthColor === "green"
                ? "border-green-200 bg-green-50 text-green-700"
                : "border-red-200 bg-red-50 text-red-700"
            }
          >
            {healthIcon}
            <span className="ml-1">{healthLabel}</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.locations && status.locations.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">
              Location → Venue mapping
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Map each Lightspeed location to one of the three venues. Sales
              ingested by email or API will be tagged with the mapped venue.
            </p>
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
                        const updated = (status.locations ?? []).map((l) =>
                          l.id === loc.id ? { ...l, venue: newVenue } : l
                        )
                        await updateLocationVenueMapping(updated)
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

        {status.connectedAt && (
          <p className="text-xs text-muted-foreground">
            Connected on{" "}
            {new Date(status.connectedAt).toLocaleDateString("en-AU", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        )}

        {!status.tokenHealthy && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Your Lightspeed authentication has expired. Please reconnect to
            resume sales data syncing.
          </div>
        )}

        <div className="flex gap-2">
          {!status.tokenHealthy && (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Redirecting..." : "Reconnect"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleDisconnect}
            disabled={isPending}
          >
            <Unplug className="mr-2 h-4 w-4" />
            {isPending ? "Disconnecting..." : "Disconnect"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
