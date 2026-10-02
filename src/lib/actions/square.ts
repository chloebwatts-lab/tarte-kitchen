"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@/generated/prisma/client"
import { listLocations } from "@/lib/square/client"
import { saveSquareConnection, getSquareStatus, getSquareConnection, type SquareLocationMapping } from "@/lib/square/token"
import { normalizeVenueSlug } from "@/lib/venues"
import { syncSquareSales, aestDates } from "@/lib/square/sync"

export type { SquareStatus } from "@/lib/square/token"

export async function getSquareConnectionStatus() {
  return getSquareStatus()
}

/**
 * Chloe pastes a production access token from developer.squareup.com. We
 * prove it works (list locations), store it encrypted and pre-map each
 * location to a venue by name. The token itself never reaches the client.
 */
export async function connectSquare(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const token = String(formData.get("token") ?? "").trim()
  if (!token || token.length < 20) return { ok: false, error: "That does not look like a Square access token." }
  try {
    const locations = await listLocations(token)
    if (!locations.length) return { ok: false, error: "Token works but has no active locations." }
    const mapped: SquareLocationMapping[] = locations.map((l) => ({
      id: l.id,
      name: l.name,
      venue: normalizeVenueSlug(l.name) ?? "BEACH_HOUSE",
    }))
    await saveSquareConnection(token, locations[0].merchant_id ?? null, mapped)
    revalidatePath("/settings/integrations")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Square rejected the token." }
  }
}

export async function disconnectSquare() {
  await db.squareConnection.deleteMany()
  revalidatePath("/settings/integrations")
}

export async function updateSquareLocationMapping(locations: SquareLocationMapping[]) {
  const c = await getSquareConnection()
  if (!c) throw new Error("Square not connected")
  await db.squareConnection.update({ where: { id: c.id }, data: { locations: locations as unknown as Prisma.InputJsonValue } })
  revalidatePath("/settings/integrations")
}

/** Manual "sync now": last `days` AEST days ending today. */
export async function syncSquareNow(days = 2) {
  const safe = Math.max(1, Math.min(14, Math.floor(days)))
  try {
    const results = await syncSquareSales(aestDates(safe))
    revalidatePath("/settings/integrations")
    return { ok: true as const, results }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const c = await getSquareConnection()
    if (c) await db.squareConnection.update({ where: { id: c.id }, data: { lastError: msg } })
    revalidatePath("/settings/integrations")
    return { ok: false as const, error: msg }
  }
}
