import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"
import type { Prisma } from "@/generated/prisma/client"

export interface UberStoreMapping { uuid: string; name: string; venue: string }

export async function getUberConnection() {
  return db.uberEatsConnection.findFirst({ orderBy: { connectedAt: "desc" } })
}

export async function getUberCookie(): Promise<string> {
  const c = await getUberConnection()
  if (!c) throw new Error("Uber Eats not connected")
  return decrypt(c.cookie)
}

export function uberStores(conn: { stores: unknown } | null): UberStoreMapping[] {
  if (!conn?.stores || !Array.isArray(conn.stores)) return []
  return conn.stores as UberStoreMapping[]
}

export async function saveUberConnection(cookie: string, stores: UberStoreMapping[]) {
  await db.uberEatsConnection.deleteMany()
  return db.uberEatsConnection.create({ data: { cookie: encrypt(cookie), stores: stores as unknown as Prisma.InputJsonValue } })
}

export interface UberStatus {
  connected: boolean
  connectedAt: Date | null
  lastSyncAt: Date | null
  lastError: string | null
  stores: UberStoreMapping[]
}

export async function getUberStatus(): Promise<UberStatus> {
  const c = await getUberConnection()
  return { connected: Boolean(c), connectedAt: c?.connectedAt ?? null, lastSyncAt: c?.lastSyncAt ?? null, lastError: c?.lastError ?? null, stores: uberStores(c) }
}
