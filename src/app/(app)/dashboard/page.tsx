import { getDashboardStats } from "@/lib/actions/dashboard"
import { DashboardContent } from "@/components/dashboard-content"

export default async function DashboardPage() {
  const stats = await getDashboardStats()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your kitchen costs and menu performance
        </p>
      </div>
      <DashboardContent stats={stats} />
    </div>
  )
}
