import { db } from "@/lib/db"
import { encrypt, decrypt } from "@/lib/encryption"
import type { Prisma } from "@/generated/prisma/client"

export interface SquareLocationMapping {
  id: string
  name: string
  venue: string
}

export async function getSquareConnection() {
  return db.squareConnection.findFirst({ orderBy: { connectedAt: "desc" } })
}

export async function getSquareAccessToken(): Promise<string> {
  const c = await getSquareConnection()
  if (!c) throw new Error("Square not connected")
  return decrypt(c.accessToken)
}

export function squareLocations(conn: { locations: unknown } | null): SquareLocationMapping[] {
  return ((conn?.locations as SquareLocationMapping[] | null) ?? []).filter(
    (l) => l && typeof l.id === "string"
  )
}

export async function saveSquareConnection(
  token: string,
  merchantId: string | null,
  locations: SquareLocationMapping[]
) {
  await db.squareConnection.deleteMany()
  return db.squareConnection.create({
    data: { accessToken: encrypt(token), merchantId, locations: locations as unknown as Prisma.InputJsonValue },
  })
}

export interface SquareStatus {
  connected: boolean
  connectedAt: Date | null
  lastSyncAt: Date | null
  lastError: string | null
  locations: SquareLocationMapping[]
}

export async function getSquareStatus(): Promise<SquareStatus> {
  const c = await getSquareConnection()
  return {
    connected: Boolean(c),
    connectedAt: c?.connectedAt ?? null,
    lastSyncAt: c?.lastSyncAt ?? null,
    lastError: c?.lastError ?? null,
    locations: squareLocations(c),
  }
}
