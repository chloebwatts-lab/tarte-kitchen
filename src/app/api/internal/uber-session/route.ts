export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { fetchTodaySales, UberAuthError } from "@/lib/uber/client"
import { getUberConnection, getUberCookie, getUberStatus, uberStores } from "@/lib/uber/token"
import { connectUberCookie } from "@/lib/uber/connect"
import { brisbaneNow } from "@/lib/sales/insights"

/**
 * Uber Eats session, for the self-sign-in job on the office Mac
 * (tools/uber-login, 9 Nov 2026). Bearer = CRON_SECRET like the other
 * internal routes; the job reaches it through the droplet's cron container,
 * so the secret never leaves the droplet.
 *
 * GET  -> { connected, alive, lastSyncAt, lastError }. `alive` is a live
 *         call to Uber with the stored session: false means Uber has logged
 *         it out (about monthly) and the job should sign in again; null
 *         means Uber could not be reached, so nothing is known.
 * POST { cookie } -> stores the browser session (encrypted, as a paste
 *         would) and loads the last 14 days. The cookie is never echoed.
 */
function authorised(req: NextRequest): boolean {
  const auth = req.headers.get("authorization")
  return Boolean(process.env.CRON_SECRET) && auth === `Bearer ${process.env.CRON_SECRET}`
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 })
  const status = await getUberStatus()
  let alive: boolean | null = null
  if (status.connected) {
    try {
      const conn = await getUberConnection()
      const store = uberStores(conn)[0]
      if (store) {
        await fetchTodaySales(await getUberCookie(), store.uuid, brisbaneNow().date)
        alive = true
      }
    } catch (err) {
      alive = err instanceof UberAuthError ? false : null
    }
  } else {
    alive = false
  }
  return Response.json({ connected: status.connected, alive, lastSyncAt: status.lastSyncAt, lastError: status.lastError, checkedAt: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return new Response("Unauthorized", { status: 401 })
  let cookie = ""
  try {
    const body = (await req.json()) as { cookie?: unknown }
    cookie = typeof body.cookie === "string" ? body.cookie.trim() : ""
  } catch {
    return Response.json({ ok: false, error: "Body must be JSON with a cookie string" }, { status: 400 })
  }
  if (!cookie) return Response.json({ ok: false, error: "No cookie given" }, { status: 400 })
  const result = await connectUberCookie(cookie)
  if (!result.ok) return Response.json(result, { status: 422 })
  return Response.json(result)
}
