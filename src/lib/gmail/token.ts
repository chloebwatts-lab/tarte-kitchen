import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"

export async function getActiveGmailConnection() {
  return db.gmailConnection.findFirst({
    orderBy: { createdAt: "desc" },
  })
}

export async function getDecryptedGmailTokens() {
  const connection = await getActiveGmailConnection()
  if (!connection) return null

  return {
    ...connection,
    accessToken: decrypt(connection.accessToken),
    refreshToken: decrypt(connection.refreshToken),
  }
}

export async function refreshGmailAccessToken(): Promise<string> {
  const connection = await getActiveGmailConnection()
  if (!connection) throw new Error("No Gmail connection found")

  const refreshToken = decrypt(connection.refreshToken)

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Gmail token refresh failed: ${res.status} ${error}`)
  }

  const data = await res.json()

  await db.gmailConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(data.access_token),
      // Google may or may not return a new refresh token
      ...(data.refresh_token && { refreshToken: encrypt(data.refresh_token) }),
      tokenExpiry: new Date(Date.now() + data.expires_in * 1000),
    },
  })

  return data.access_token as string
}

export async function getValidGmailAccessToken(): Promise<string> {
  const connection = await getActiveGmailConnection()
  if (!connection) throw new Error("No Gmail connection found")

  // Refresh if token expires within 30 seconds
  const bufferMs = 30 * 1000
  if (connection.tokenExpiry.getTime() - Date.now() < bufferMs) {
    return refreshGmailAccessToken()
  }

  return decrypt(connection.accessToken)
}

export type GmailConnectionStatus = {
  connected: boolean
  emailAddress?: string
  lastCheckedAt?: Date | null
  connectedAt?: Date
  tokenHealthy?: boolean
}

export async function getGmailConnectionStatus(): Promise<GmailConnectionStatus> {
  const connection = await getActiveGmailConnection()
  if (!connection) {
    return { connected: false }
  }

  const tokenHealthy = connection.tokenExpiry.getTime() > Date.now()

  return {
    connected: true,
    emailAddress: connection.email,
    lastCheckedAt: connection.lastScanAt,
    connectedAt: connection.createdAt,
    tokenHealthy,
  }
}
