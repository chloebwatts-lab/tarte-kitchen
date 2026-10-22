"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@/generated/prisma/client"
import { listLocations, getMerchant } from "@/lib/square/client"
import { saveSquareConnection, getSquareStatus, type SquareLocationMapping } from "@/lib/square/token"
import { normalizeVenueSlug } from "@/lib/venues"
import { syncSquareSales, aestDates } from "@/lib/square/sync"

export type { SquareStatus, SquareAccount } from "@/lib/square/token"

export async function getSquareConnectionStatus() {
  return getSquareStatus()
}

/**
 * Chloe pastes a production access token from developer.squareup.com for
 * ONE Square account (Currumbin or Burleigh; they are separate accounts).
 * We prove it works (list locations), store it encrypted on that account's
 * row and pre-map each location to a venue by name. Pasting a token for an
 * account that is already connected replaces that account's token only.
 * The token itself never reaches the client.
 */
export async function connectSquare(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const token = String(formData.get("token") ?? "").trim()
  if (!token || token.length < 20) return { ok: false, error: "That does not look like a Square access token." }
  try {
    const locations = await listLocations(token)
    if (!locations.length) return { ok: false, error: "Token works but has no active locations." }
    const merchant = await getMerchant(token).catch(() => ({ id: locations[0].merchant_id ?? "", businessName: null }))
    const merchantId = merchant.id || locations[0].merchant_id || null
    const mapped: SquareLocationMapping[] = locations.map((l) => ({
      id: l.id,
      name: l.name,
      venue: normalizeVenueSlug(l.name) ?? normalizeVenueSlug(merchant.businessName ?? "") ?? "BURLEIGH",
    }))
    await saveSquareConnection(token, merchantId, merchant.businessName, mapped)
    revalidatePath("/settings/integrations")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Square rejected the token." }
  }
}

/** Remove one Square account; the others keep working. */
export async function disconnectSquare(connectionId: string) {
  await db.squareConnection.delete({ where: { id: connectionId } }).catch(() => {})
  revalidatePath("/settings/integrations")
}

export async function updateSquareLocationMapping(connectionId: string, locations: SquareLocationMapping[]) {
  await db.squareConnection.update({ where: { id: connectionId }, data: { locations: locations as unknown as Prisma.InputJsonValue } })
  revalidatePath("/settings/integrations")
}

/** Manual "sync now": last `days` AEST days ending today, every account. */
export async function syncSquareNow(days = 2) {
  const safe = Math.max(1, Math.min(14, Math.floor(days)))
  try {
    const results = await syncSquareSales(aestDates(safe))
    revalidatePath("/settings/integrations")
    return { ok: true as const, results }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    revalidatePath("/settings/integrations")
    return { ok: false as const, error: msg }
  }
}
