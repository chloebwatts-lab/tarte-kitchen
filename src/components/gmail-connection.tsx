"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Mail, Unplug, ExternalLink, CheckCircle2, XCircle } from "lucide-react"
import { disconnectGmail } from "@/lib/actions/gmail"
import type { GmailConnectionStatus } from "@/lib/gmail/token"

interface Props {
  status: GmailConnectionStatus
}

export function GmailConnection({ status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [connecting, setConnecting] = useState(false)

  async function handleConnect() {
    setConnecting(true)
    try {
      const res = await fetch("/api/auth/gmail", { method: "POST" })
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
      await disconnectGmail()
      router.refresh()
    })
  }

  if (!status.connected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail — Invoice Monitoring
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Connect your Gmail account to automatically detect and process
            supplier invoices. The system will monitor incoming emails, extract
            invoice data, and alert you to any price changes.
          </p>

          <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm space-y-2">
            <p className="font-medium">Before connecting:</p>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
              <li>
                Create a project in the{" "}
                <a
                  href="https://console.cloud.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline inline-flex items-center gap-1"
                >
                  Google Cloud Console <ExternalLink className="h-3 w-3" />
                </a>
              </li>
              <li>Enable the Gmail API for that project</li>
              <li>Create OAuth 2.0 credentials (Web application type)</li>
              <li>Add the redirect URI to your authorized redirect URIs</li>
              <li>Add the Client ID and Secret to your environment variables</li>
            </ol>
          </div>

          {process.env.NEXT_PUBLIC_GOOGLE_CONFIGURED === "true" ? (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Redirecting..." : "Connect Gmail"}
            </Button>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Google OAuth credentials are not configured. Add{" "}
              <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_ID</code> and{" "}
              <code className="rounded bg-amber-100 px-1">GOOGLE_CLIENT_SECRET</code>{" "}
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
            <Mail className="h-5 w-5" />
            Gmail — Invoice Monitoring
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
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <span className="text-muted-foreground">Account</span>
            <span className="font-medium">{status.emailAddress}</span>
          </div>
          {status.lastCheckedAt && (
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <span className="text-muted-foreground">Last checked</span>
              <span className="font-medium">
                {new Date(status.lastCheckedAt).toLocaleString("en-AU", {
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

        {!status.tokenHealthy && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Your Gmail authentication has expired. Please reconnect to resume
            invoice monitoring.
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
