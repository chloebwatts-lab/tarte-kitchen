export const dynamic = "force-dynamic"

import { getLightspeedStatus } from "@/lib/actions/lightspeed"
import { LightspeedConnection } from "@/components/lightspeed-connection"

export default async function IntegrationsPage() {
  const status = await getLightspeedStatus()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external services to sync sales data and automate workflows
        </p>
      </div>
      <LightspeedConnection status={status} />
    </div>
  )
}
