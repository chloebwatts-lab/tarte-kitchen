export const dynamic = "force-dynamic"

import Link from "next/link"
import { getCogsDashboardData } from "@/lib/actions/cogs"
import { CogsDashboard } from "@/components/cogs-dashboard"

export default async function CogsPage() {
  const data = await getCogsDashboardData({ weeks: 12 })
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">COGS</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Weekly cost of goods breakdown by venue, from the Thursday
            Burleigh + Currumbin xlsx reports.
          </p>
        </div>
        <Link
          href="/labour/upload"
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Upload COGS xlsx
        </Link>
      </div>
      <CogsDashboard initial={data} />
    </div>
  )
}
