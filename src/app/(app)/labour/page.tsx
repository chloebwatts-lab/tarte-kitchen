export const dynamic = "force-dynamic"

import Link from "next/link"
import {
  getLabourDashboardData,
  hasDeputyConnection,
} from "@/lib/actions/labour"
import { LabourDashboard } from "@/components/labour-dashboard"
import { Card, CardContent } from "@/components/ui/card"

export default async function LabourPage() {
  const connected = await hasDeputyConnection()
  if (!connected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Labour</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Track wage cost vs revenue per venue per day. Powered by Deputy.
          </p>
        </div>
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Connect Deputy to unlock daily per-venue labour tracking.
            </p>
            <Link
              href="/api/deputy/auth"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
            >
              Connect Deputy
            </Link>
            <p className="mt-3 text-[11px] text-muted-foreground">
              You&apos;ll be redirected to deputy.com to authorise access.
              After connecting, map each Deputy location to a venue in
              Settings → Integrations → Deputy.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }
  const data = await getLabourDashboardData({ venue: "ALL", rangeDays: 28 })
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Labour</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Daily labour % by venue, sourced from Deputy timesheets.
        </p>
      </div>
      <LabourDashboard initial={data} />
    </div>
  )
}
