"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@/generated/prisma/client"
import { parseCookieInput, hasSessionCookie, fetchTodaySales, KNOWN_UBER_STORES, UberAuthError } from "@/lib/uber/client"
import { saveUberConnection, getUberStatus, getUberConnection, uberStores, type UberStoreMapping } from "@/lib/uber/token"
import { syncUberSales } from "@/lib/uber/sync"
import { brisbaneNow } from "@/lib/sales/insights"

export type { UberStatus } from "@/lib/uber/token"

export async function getUberConnectionStatus() {
  return getUberStatus()
}

/**
 * Chloe pastes the cookie line (or a whole Copy-as-cURL) from a logged-in
 * Uber Eats Manager tab. We prove it works with one live call, store it
 * encrypted and map the two known shops to venues. The cookie never comes
 * back to the client.
 */
export async function connectUber(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const cookie = parseCookieInput(String(formData.get("cookie") ?? ""))
  if (!cookie) return { ok: false, error: "That does not look like a cookie. Paste the whole cookie line (or the Copy as cURL text)." }
  if (!hasSessionCookie(cookie)) return { ok: false, error: "No sid= in that cookie. Copy it from a request on merchants.ubereats.com while logged in." }
  try {
    const probe = KNOWN_UBER_STORES[1]
    await fetchTodaySales(cookie, probe.uuid, brisbaneNow().date)
    const existing = uberStores(await getUberConnection())
    const stores: UberStoreMapping[] = existing.length ? existing : KNOWN_UBER_STORES.map((s) => ({ ...s }))
    await saveUberConnection(cookie, stores)
    revalidatePath("/settings/integrations")
    try { await syncUberSales(14) } catch (err) { console.error("[uber] first sync failed", err) }
    return { ok: true }
  } catch (err) {
    if (err instanceof UberAuthError) return { ok: false, error: "Uber did not accept that session. Copy the cookie again from a tab where Uber Eats Manager is open and logged in." }
    return { ok: false, error: err instanceof Error ? err.message : "Uber rejected the cookie." }
  }
}

export async function disconnectUber() {
  await db.uberEatsConnection.deleteMany()
  revalidatePath("/settings/integrations")
}

export async function updateUberStoreMapping(stores: UberStoreMapping[]) {
  const c = await getUberConnection()
  if (!c) throw new Error("Uber Eats not connected")
  await db.uberEatsConnection.update({ where: { id: c.id }, data: { stores: stores as unknown as Prisma.InputJsonValue } })
  revalidatePath("/settings/integrations")
}

/** Manual "sync now": last `days` Brisbane days ending today. */
export async function syncUberNow(days = 14) {
  const safe = Math.max(1, Math.min(60, Math.floor(days)))
  try {
    const results = await syncUberSales(safe)
    revalidatePath("/settings/integrations")
    return { ok: true as const, results }
  } catch (err) {
    revalidatePath("/settings/integrations")
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
  }
}
