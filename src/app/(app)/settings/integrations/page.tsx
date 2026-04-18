export const dynamic = "force-dynamic"

import { getLightspeedStatus } from "@/lib/actions/lightspeed"
import { getGmailStatus } from "@/lib/actions/gmail"
import { getXeroStatus } from "@/lib/actions/xero"
import { LightspeedConnection } from "@/components/lightspeed-connection"
import { GmailConnection } from "@/components/gmail-connection"
import { XeroConnection } from "@/components/xero-connection"

export default async function IntegrationsPage() {
  const [lightspeedStatus, gmailStatus, xeroStatus] = await Promise.all([
    getLightspeedStatus(),
    getGmailStatus(),
    getXeroStatus(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external services to sync sales data and automate workflows
        </p>
      </div>
      <XeroConnection status={xeroStatus} />
      <GmailConnection
        status={gmailStatus}
        configured={Boolean(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET)}
      />
      <LightspeedConnection status={lightspeedStatus} />
    </div>
  )
}
