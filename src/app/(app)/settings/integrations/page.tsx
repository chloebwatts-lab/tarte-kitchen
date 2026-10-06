export const dynamic = "force-dynamic"

import { BackLink } from "@/components/ui/back-link"
import { getLightspeedStatus } from "@/lib/actions/lightspeed"
import { getGmailStatus } from "@/lib/actions/gmail"
import { getXeroStatus } from "@/lib/actions/xero"
import { getDeputyStatus } from "@/lib/actions/deputy"
import { getGbpConnectionStatus } from "@/lib/gbp/token"
import { LightspeedConnection } from "@/components/lightspeed-connection"
import { SquareConnection } from "@/components/square-connection"
import { getSquareConnectionStatus } from "@/lib/actions/square"
import { UberConnection } from "@/components/uber-connection"
import { getUberConnectionStatus } from "@/lib/actions/uber"
import { GmailConnection } from "@/components/gmail-connection"
import { XeroConnection } from "@/components/xero-connection"
import { DeputyConnection } from "@/components/deputy-connection"
import { GbpConnection } from "@/components/gbp-connection"

export default async function IntegrationsPage() {
  const [lightspeedStatus, gmailStatus, xeroStatus, deputyStatus, gbpStatus, squareStatus, uberStatus] =
    await Promise.all([
      getLightspeedStatus(),
      getGmailStatus(),
      getXeroStatus(),
      getDeputyStatus(),
      getGbpConnectionStatus(),
      getSquareConnectionStatus(),
      getUberConnectionStatus(),
    ])

  const googleOauthConfigured = Boolean(
    process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET
  )

  return (
    <div className="space-y-6">
      <BackLink href="/dashboard" label="Back to dashboard" />
      <div>
        <h1 className="font-serif text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect external services to sync sales data and automate workflows
        </p>
      </div>
      <XeroConnection status={xeroStatus} />
      <GmailConnection status={gmailStatus} configured={googleOauthConfigured} />
      <GbpConnection status={gbpStatus} configured={googleOauthConfigured} />
      <SquareConnection status={squareStatus} />
      <UberConnection status={uberStatus} />
      <LightspeedConnection status={lightspeedStatus} />
      <DeputyConnection
        status={deputyStatus}
        configured={Boolean(
          process.env.DEPUTY_CLIENT_ID && process.env.DEPUTY_CLIENT_SECRET
        )}
      />
    </div>
  )
}
