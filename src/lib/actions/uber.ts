"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { Prisma } from "@/generated/prisma/client"
import { parseCookieInput } from "@/lib/uber/client"
import { getUberStatus, getUberConnection, type UberStoreMapping } from "@/lib/uber/token"
import { syncUberSales } from "@/lib/uber/sync"
import { connectUberCookie } from "@/lib/uber/connect"

export type { UberStatus } from "@/lib/uber/token"

export async function getUberConnectionStatus() {
  return getUberStatus()
}

/**
 * Manual fallback: a cookie line (or a whole Copy-as-cURL) pasted from a
 * logged-in Uber Eats Manager tab. Normally the self-sign-in job on the
 * office Mac feeds the same path through /api/internal/uber-session. One
 * live call proves the session, then it is stored encrypted and the two
 * known shops are mapped to venues. The cookie never comes back to the client.
 */
export async function connectUber(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const cookie = parseCookieInput(String(formData.get("cookie") ?? ""))
  if (!cookie) return { ok: false, error: "That does not look like a cookie. Paste the whole cookie line (or the Copy as cURL text)." }
  const r = await connectUberCookie(cookie)
  revalidatePath("/settings/integrations")
  return r.ok ? { ok: true } : { ok: false, error: r.error }
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
