/**
 * Store a fresh Uber Eats Manager session and load the last 14 days. Shared
 * by the Settings card (Chloe pastes a Copy-as-cURL) and by
 * /api/internal/uber-session, which the self-sign-in job on the office Mac
 * calls after it has logged in to Uber itself (tools/uber-login, 9 Nov 2026).
 */
import { hasSessionCookie, fetchTodaySales, KNOWN_UBER_STORES, UberAuthError } from "./client"
import { saveUberConnection, getUberConnection, uberStores, type UberStoreMapping } from "./token"
import { syncUberSales, type UberSyncResult } from "./sync"
import { brisbaneNow } from "@/lib/sales/insights"

export type ConnectUberResult = { ok: true; results: UberSyncResult[]; syncError: string | null } | { ok: false; error: string }

export async function connectUberCookie(cookie: string): Promise<ConnectUberResult> {
  if (!hasSessionCookie(cookie)) return { ok: false, error: "No sid= in that cookie. Copy it from a request on merchants.ubereats.com while logged in." }
  try {
    const probe = KNOWN_UBER_STORES[1]
    await fetchTodaySales(cookie, probe.uuid, brisbaneNow().date)
  } catch (err) {
    if (err instanceof UberAuthError) return { ok: false, error: "Uber did not accept that session. Copy the cookie again from a tab where Uber Eats Manager is open and logged in." }
    return { ok: false, error: err instanceof Error ? err.message : "Uber rejected the cookie." }
  }
  const existing = uberStores(await getUberConnection())
  const stores: UberStoreMapping[] = existing.length ? existing : KNOWN_UBER_STORES.map((s) => ({ ...s }))
  await saveUberConnection(cookie, stores)
  try {
    return { ok: true, results: await syncUberSales(14), syncError: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("[uber] first sync after connect failed", msg)
    return { ok: true, results: [], syncError: msg }
  }
}
