import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"

// Re-export for backward compatibility
export { encrypt, decrypt }

export async function getActiveConnection() {
  const connection = await db.lightspeedConnection.findFirst({
    orderBy: { connectedAt: "desc" },
  })
  return connection
}

export async function getDecryptedTokens() {
  const connection = await getActiveConnection()
  if (!connection) return null

  return {
    ...connection,
    accessToken: decrypt(connection.accessToken),
    refreshToken: decrypt(connection.refreshToken),
  }
}

export async function refreshAccessToken() {
  const connection = await getActiveConnection()
  if (!connection) throw new Error("No Lightspeed connection found")

  const refreshToken = decrypt(connection.refreshToken)

  const clientId = process.env.LIGHTSPEED_CLIENT_ID!
  const clientSecret = process.env.LIGHTSPEED_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")

  const res = await fetch("https://cloud.lightspeedapp.com/oauth/token", {
    method: "POST",
    headers: {
      "Authorization": `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Token refresh failed: ${res.status} ${error}`)
  }

  const data = await res.json()

  await db.lightspeedConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(data.access_token),
      refreshToken: encrypt(data.refresh_token),
      tokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    },
  })

  return data.access_token as string
}

export async function getValidAccessToken(): Promise<string> {
  const connection = await getActiveConnection()
  if (!connection) throw new Error("No Lightspeed connection found")

  // Refresh if token expires within 30 seconds
  const bufferMs = 30 * 1000
  if (connection.tokenExpiresAt.getTime() - Date.now() < bufferMs) {
    return refreshAccessToken()
  }

  return decrypt(connection.accessToken)
}

export type ConnectionStatus = {
  connected: boolean
  businessId?: string | null
  locations?: Array<{ id: string; name: string; venue: string }>
  connectedAt?: Date
  tokenHealthy?: boolean
  tokenExpiresAt?: Date
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const connection = await getActiveConnection()
  if (!connection) {
    return { connected: false }
  }

  const now = Date.now()
  const expiresAt = connection.tokenExpiresAt.getTime()
  // Yellow = expires within 1 hour, Red = already expired
  const tokenHealthy = expiresAt > now

  return {
    connected: true,
    businessId: connection.businessId,
    locations: (connection.businessLocations as Array<{ id: string; name: string; venue: string }>) ?? [],
    connectedAt: connection.connectedAt,
    tokenHealthy,
    tokenExpiresAt: connection.tokenExpiresAt,
  }
}
