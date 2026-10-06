/**
 * Uber Eats Manager, read the way the website reads it. Uber gives merchants
 * no sales API (its Reports API is partner-only), so these are the JSON
 * endpoints behind merchants.ubereats.com, called with a pasted browser
 * session cookie. Pure helpers (cookie parsing, response parsing) sit here
 * with no I/O so they can be unit-tested; the fetches are at the bottom.
 */

export const UBER_MANAGER = "https://merchants.ubereats.com"

/** Known shops on the Tarte account (names as Uber shows them). */
export const KNOWN_UBER_STORES: Array<{ uuid: string; name: string; venue: "BURLEIGH" | "BEACH_HOUSE" }> = [
  { uuid: "d6b633f2-1f41-52b2-b605-2c40d6128a83", name: "Tarte Bakery Burleigh", venue: "BURLEIGH" },
  { uuid: "e6b038aa-1239-5c30-a2b1-d0eb980fd851", name: "Tarte Takeaway", venue: "BEACH_HOUSE" },
]

/**
 * Accepts whatever gets pasted: a bare `cookie` header value, a line that
 * starts with "cookie:", or a whole "Copy as cURL" command (we take its
 * -b / -H 'cookie: …' part). Returns the cookie header value or null.
 */
export function parseCookieInput(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  // cURL paste: -b '...' or -H 'cookie: ...' (single or double quotes, $'...' too)
  const curl = text.match(/(?:-b|--cookie)\s+\$?(['"])([\s\S]*?)\1/) ?? text.match(/-H\s+\$?(['"])\s*cookie:\s*([\s\S]*?)\1/i)
  if (curl) return cleanCookie(curl[2])
  // "cookie: a=b; c=d" line
  const line = text.match(/^cookie:\s*(.+)$/im)
  if (line) return cleanCookie(line[1])
  // bare "a=b; c=d"
  if (/^[^\s=;]+=[^;]*(;\s*[^\s=;]+=[^;]*)*;?$/.test(text.replace(/\n/g, ""))) return cleanCookie(text)
  return null
}

function cleanCookie(v: string): string | null {
  const parts = v.replace(/\\n/g, "").split(";").map((p) => p.trim()).filter((p) => p.includes("="))
  if (!parts.length) return null
  return parts.join("; ")
}

/** True when the session (sid) cookie is present; Uber rejects everything without it. */
export function hasSessionCookie(cookie: string): boolean {
  return /(^|;\s*)sid=/.test(cookie)
}

export interface UberDaily { date: string; sales: number; orders: number }

interface HomepageResponse {
  status?: string
  data?: {
    salesByMetric?: Record<string, { current?: Array<{ timestamp: string; value: number }> }>
    message?: string
  }
}

/** getHomepageDataV2 -> one row per calendar day (days with no orders are 0). */
export function parseHomepageDaily(json: unknown): UberDaily[] {
  const r = json as HomepageResponse
  if (r?.status !== "success" || !r.data?.salesByMetric) throw new Error(uberErrorMessage(json))
  const sales = r.data.salesByMetric.SALES?.current ?? []
  const orders = new Map((r.data.salesByMetric.ORDER_VOLUME?.current ?? []).map((x) => [x.timestamp, x.value]))
  return sales
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.timestamp))
    .map((x) => ({ date: x.timestamp, sales: Math.round((x.value ?? 0) * 100) / 100, orders: Math.round(orders.get(x.timestamp) ?? 0) }))
}

export interface UberToday { sales: number; orders: number; avgTicket: number }

export function parseTodayMetrics(json: unknown): UberToday {
  const r = json as { status?: string; data?: { totalSales?: number; totalOrders?: number; avgTicketSize?: number } }
  if (r?.status !== "success" || !r.data) throw new Error(uberErrorMessage(json))
  return {
    sales: Math.round((r.data.totalSales ?? 0) * 100) / 100,
    orders: Math.round(r.data.totalOrders ?? 0),
    avgTicket: Math.round((r.data.avgTicketSize ?? 0) * 100) / 100,
  }
}

export function uberErrorMessage(json: unknown): string {
  const r = json as { status?: string; data?: { message?: string } }
  return r?.data?.message ? `Uber: ${r.data.message}` : "Uber returned an unexpected response"
}

// ─── HTTP ───────────────────────────────────────────────────────────────────

export class UberAuthError extends Error {
  constructor(msg = "Uber Eats session has expired. Paste a fresh cookie in Settings > Integrations.") { super(msg); this.name = "UberAuthError" }
}

function headers(cookie: string) {
  return {
    "content-type": "application/json",
    "x-csrf-token": "x",
    cookie,
    origin: UBER_MANAGER,
    referer: `${UBER_MANAGER}/manager/home`,
    "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
    accept: "application/json",
  }
}

async function post(cookie: string, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${UBER_MANAGER}/manager/api/${path}?localeCode=en-GB`, {
    method: "POST", headers: headers(cookie), body: JSON.stringify(body), redirect: "manual",
  })
  // A dead session bounces to auth.uber.com (302) or answers 401/403.
  if (res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) throw new UberAuthError()
  const text = await res.text()
  if (!res.ok) throw new Error(`Uber ${path} HTTP ${res.status}: ${text.slice(0, 200)}`)
  try { return JSON.parse(text) } catch { throw new UberAuthError("Uber answered with a login page, not data. Paste a fresh cookie in Settings > Integrations.") }
}

const AEST = "+10:00"

/** Daily sales for one shop, `from`..`to` inclusive (YYYY-MM-DD, Brisbane days). */
export async function fetchDailySales(cookie: string, storeUuid: string, from: string, to: string): Promise<UberDaily[]> {
  const json = await post(cookie, "getHomepageDataV2", {
    userTimezoneOffset: -600,
    currPeriod: { start: `${from}T00:00:00.000${AEST}`, end: `${to}T23:59:59.999${AEST}`, timeUnit: "day" },
    prevPeriod: { start: `${from}T00:00:00.000${AEST}`, end: `${to}T23:59:59.999${AEST}`, timeUnit: "day" },
    restaurantUuids: [storeUuid], userUuid: null, dominantCurrencyCode: "AUD", isUMetricQueries: true,
    areAllLocationsChecked: false, showCustomersV2Card: false, areSelectedLocationsGroceryRetailOnly: false,
  })
  return parseHomepageDaily(json)
}

/** Live running total for one shop on a Brisbane date (meant for today). */
export async function fetchTodaySales(cookie: string, storeUuid: string, date: string): Promise<UberToday> {
  const start = Math.floor(new Date(`${date}T00:00:00${AEST}`).getTime() / 1000)
  const next = new Date(`${date}T00:00:00${AEST}`); next.setUTCDate(next.getUTCDate() + 1)
  const json = await post(cookie, "getTodaySalesMetrics", {
    userTimezoneOffset: -600, restaurantUuids: [storeUuid], userUuid: null,
    timeRange: { startTime: start, endTime: Math.floor(next.getTime() / 1000) - 1 },
    currentDate: `${date} 00:00:00`, endDate: `${next.toISOString().slice(0, 10)} 00:00:00`,
    dominantCurrencyCode: "AUD", isUMetricQueries: true,
  })
  return parseTodayMetrics(json)
}
