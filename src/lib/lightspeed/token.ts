import { createCipheriv, createDecipheriv, randomBytes } from "crypto"
import { db } from "@/lib/db"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY
  if (!key) throw new Error("TOKEN_ENCRYPTION_KEY is not set")
  // Key should be base64-encoded 32-byte value
  return Buffer.from(key, "base64")
}

export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "hex")
  encrypted += cipher.final("hex")
  const tag = cipher.getAuthTag()
  // Format: iv:tag:ciphertext (all hex)
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`
}

export function decrypt(encrypted: string): string {
  const key = getKey()
  const [ivHex, tagHex, ciphertext] = encrypted.split(":")
  if (!ivHex || !tagHex || !ciphertext) {
    throw new Error("Invalid encrypted token format")
  }
  const iv = Buffer.from(ivHex, "hex")
  const tag = Buffer.from(tagHex, "hex")
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  let decrypted = decipher.update(ciphertext, "hex", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

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
