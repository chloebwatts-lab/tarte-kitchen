export const dynamic = "force-dynamic"

import { getWeeklyPnl, getLabourStats, getXeroStatus } from "@/lib/actions/xero"
import { CostOverviewDashboard } from "@/components/cost-overview-dashboard"

export default async function ReportsPage() {
  const [weeklyPnl, labourStats, xeroStatus] = await Promise.all([
    getWeeklyPnl(13),
    getLabourStats(),
    getXeroStatus(),
  ])

  return (
    <CostOverviewDashboard
      weeklyPnl={weeklyPnl}
      labourStats={labourStats}
      xeroConnected={xeroStatus.connected}
    />
  )
}
