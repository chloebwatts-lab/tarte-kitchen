export const dynamic = "force-dynamic"

import { getCurrentWeekSpend } from "@/lib/spend/current-week"
import { SpendDashboard } from "@/components/spend-dashboard"

export default async function SpendPage() {
  const data = await getCurrentWeekSpend()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Live Spend</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Current trading week (Wed–Tue). Invoice spend updates as the
          hourly Gmail cron pulls in new PDFs.
        </p>
      </div>
      <SpendDashboard data={data} />
    </div>
  )
}
