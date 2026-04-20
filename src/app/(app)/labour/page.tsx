export const dynamic = "force-dynamic"

import Link from "next/link"
import { AlertTriangle } from "lucide-react"
import {
  getLabourDashboardData,
  hasDeputyConnection,
} from "@/lib/actions/labour"
import { getDeputyStatus } from "@/lib/actions/deputy"
import { LabourDashboard } from "@/components/labour-dashboard"
import { LabourRefreshButton } from "@/components/labour-refresh-button"
import { Card, CardContent } from "@/components/ui/card"

export default async function LabourPage() {
  const connected = await hasDeputyConnection()
  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Labour</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly labour % per venue. Forecasts pulled live from Deputy,
            actuals posted from payroll.
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Connect Deputy to unlock live labour tracking.
            </p>
            <Link
              href="/settings/integrations"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Go to Integrations
            </Link>
          </CardContent>
        </Card>
      </div>
    )
  }
  const [data, status] = await Promise.all([
    getLabourDashboardData(),
    getDeputyStatus(),
  ])
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Labour</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly labour % per venue. Forecast (current + next week) pulled
            from Deputy; past weeks from uploaded payroll reports.
          </p>
        </div>
        <div className="flex items-start gap-3">
          <LabourRefreshButton lastSyncedAt={status.lastSyncedAt} />
          <Link
            href="/labour/upload"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Upload payroll
          </Link>
        </div>
      </div>
      {status.unmappedCount > 0 && (
        <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          <span>
            {status.unmappedCount} Deputy operational unit
            {status.unmappedCount === 1 ? " is" : "s are"} unmapped — shifts
            from {status.unmappedCount === 1 ? "it" : "them"} aren&apos;t being
            counted, which will under-report wages.{" "}
            <Link
              href="/settings/integrations"
              className="font-medium underline hover:text-amber-900"
            >
              Fix in Integrations →
            </Link>
          </span>
        </div>
      )}
      <LabourDashboard initial={data} />
    </div>
  )
}
