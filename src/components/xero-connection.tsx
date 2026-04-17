"use client"

import { CheckCircle2, XCircle, ExternalLink } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import type { XeroStatus } from "@/lib/actions/xero"

interface Props {
  status: XeroStatus
}

export function XeroConnection({ status }: Props) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base font-semibold">Xero Payroll</CardTitle>
          <CardDescription className="mt-1">
            Automatically sync weekly labour costs from Xero payroll runs
          </CardDescription>
        </div>
        <div className="ml-4 shrink-0">
          {status.connected ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
              <XCircle className="h-3.5 w-3.5" />
              Not connected
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.connected ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            {status.organisationName && (
              <p>
                Organisation:{" "}
                <span className="font-medium text-foreground">{status.organisationName}</span>
              </p>
            )}
            {status.lastSyncedAt && (
              <p>
                Last synced:{" "}
                <span className="font-medium text-foreground">
                  {new Date(status.lastSyncedAt).toLocaleString("en-AU", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Labour costs sync automatically every Monday morning.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Connect your Xero account to pull weekly payroll data — gross wages, super, and headcount —
            for your cost overview and P&amp;L reports.
          </p>
        )}

        <Button asChild variant={status.connected ? "outline" : "default"} size="sm">
          <a href="/api/xero/auth">
            <ExternalLink className="mr-2 h-4 w-4" />
            {status.connected ? "Reconnect Xero" : "Connect Xero"}
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
