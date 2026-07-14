"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Star, Unplug, CheckCircle2 } from "lucide-react"
import type { GbpConnectionStatus } from "@/lib/gbp/token"

interface Props {
  status: GbpConnectionStatus
  configured: boolean
}

export function GbpConnection({ status, configured }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch("/api/gbp/auth", { method: "POST" })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
        return
      }
    } catch {
      // fall through
    }
    setConnecting(false)
  }

  function handleDisconnect() {
    startTransition(async () => {
      await fetch("/api/gbp/status", { method: "DELETE" })
      router.refresh()
    })
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Google Business Profile — Reviews
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect the Google account that owns the Tarte listings to pull
            every Google review (paginated, no 5-per-call cap). Replaces the
            Places API fallback once linked.
          </p>
          {configured ? (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Redirecting..." : "Connect Business Profile"}
            </Button>
          ) : (
            <div className="rounded-lg border border-amber-text/20 bg-amber-light p-3 text-sm text-amber-text">
              Google OAuth credentials missing — add{" "}
              <code className="rounded bg-amber-text/10 px-1">GMAIL_CLIENT_ID</code>{" "}
              and{" "}
              <code className="rounded bg-amber-text/10 px-1">GMAIL_CLIENT_SECRET</code>{" "}
              to the env. (Shared with the Gmail integration.)
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Star className="h-5 w-5" />
            Google Business Profile — Reviews
          </CardTitle>
          <Badge className="border-green-text/20 bg-green-light text-green-text">
            <CheckCircle2 className="h-4 w-4 text-green-text" />
            <span className="ml-1">Connected</span>
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium">{status.email}</span>
          </div>
          {status.accountName && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">GBP account</span>
              <span className="font-mono text-xs">{status.accountName}</span>
            </div>
          )}
          {status.lastSyncAt && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">Last sync</span>
              <span className="font-medium">
                {new Date(status.lastSyncAt).toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
          )}
        </div>
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
        <Button variant="outline" onClick={handleDisconnect} disabled={isPending}>
          <Unplug className="mr-2 h-4 w-4" />
          {isPending ? "Disconnecting..." : "Disconnect"}
        </Button>
      </CardContent>
    </Card>
  )
}
