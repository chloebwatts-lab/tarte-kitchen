import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"

/**
 * OAuth token plumbing for the Google Business Profile API. Mirrors
 * src/lib/gmail/token.ts — same Google OAuth provider, same refresh
 * dance, reuses the existing GMAIL_CLIENT_ID / GMAIL_CLIENT_SECRET
 * (one OAuth client, two scopes).
 */

export async function getActiveGbpConnection() {
  return db.gbpConnection.findFirst({
    orderBy: { createdAt: "desc" },
  })
}

export async function refreshGbpAccessToken(): Promise<string> {
  const connection = await getActiveGbpConnection()
  if (!connection) throw new Error("No GBP connection found")

  const refreshToken = decrypt(connection.refreshToken)

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID!,
      client_secret: process.env.GMAIL_CLIENT_SECRET!,
    }),
  })

  if (!res.ok) {
    throw new Error(`GBP token refresh failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json()

  await db.gbpConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(data.access_token),
      ...(data.refresh_token && { refreshToken: encrypt(data.refresh_token) }),
      tokenExpiry: new Date(Date.now() + data.expires_in * 1000),
    },
  })

  return data.access_token as string
}

export async function getValidGbpAccessToken(): Promise<string> {
  const connection = await getActiveGbpConnection()
  if (!connection) throw new Error("No GBP connection found")

  const bufferMs = 30 * 1000
  if (connection.tokenExpiry.getTime() - Date.now() < bufferMs) {
    return refreshGbpAccessToken()
  }

  return decrypt(connection.accessToken)
}

export interface GbpConnectionStatus {
  connected: boolean
  email?: string
  accountName?: string | null
  lastSyncAt?: Date | null
  connectedAt?: Date
}

export async function getGbpConnectionStatus(): Promise<GbpConnectionStatus> {
  const connection = await getActiveGbpConnection()
  if (!connection) return { connected: false }
  return {
    connected: true,
    email: connection.email,
    accountName: connection.accountName,
    lastSyncAt: connection.lastSyncAt,
    connectedAt: connection.createdAt,
  }
}

export function getGbpRedirectUri(): string {
  return (
    process.env.GBP_REDIRECT_URI ??
    "https://kitchen.tarte.com.au/api/gbp/callback"
  )
}
