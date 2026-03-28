import { getValidAccessToken } from "./token"

const API_BASE = "https://api.lsk.lightspeed.app"

// Simple in-memory cache for GET responses (15 min TTL)
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL = 15 * 60 * 1000

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type FetchOptions = {
  method?: string
  body?: unknown
  skipCache?: boolean
}

async function lightspeedFetch<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const { method = "GET", body, skipCache = false } = options
  const url = `${API_BASE}${path}`

  // Check cache for GET requests
  if (method === "GET" && !skipCache) {
    const cached = cache.get(url)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data as T
    }
  }

  const token = await getValidAccessToken()

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      })

      // Rate limiting — exponential backoff
      if (res.status === 429) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt), 30000)
        await sleep(backoffMs)
        continue
      }

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Lightspeed API ${res.status}: ${errorText}`)
      }

      const data = await res.json()

      // Cache GET responses
      if (method === "GET") {
        cache.set(url, { data, expiresAt: Date.now() + CACHE_TTL })
      }

      return data as T
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      if (attempt < 2) {
        await sleep(1000 * Math.pow(2, attempt))
      }
    }
  }

  throw lastError ?? new Error("Lightspeed API request failed after retries")
}

// Types for Lightspeed K-Series responses
export interface LightspeedSaleItem {
  name: string
  id?: string
  quantity: number
  amount: number // inc GST
  tax?: number
  discount?: number
}

export interface LightspeedSalesResponse {
  items: LightspeedSaleItem[]
  totalRevenue?: number
  covers?: number
}

export interface LightspeedLocation {
  id: string
  name: string
}

export const lightspeedClient = {
  async getSales(
    locationId: string,
    date: string // YYYY-MM-DD
  ): Promise<LightspeedSalesResponse> {
    return lightspeedFetch<LightspeedSalesResponse>(
      `/financial/api/businessLocation/${locationId}/sales?from=${date}&to=${date}`
    )
  },

  async getLocations(): Promise<LightspeedLocation[]> {
    return lightspeedFetch<LightspeedLocation[]>("/api/business/locations")
  },

  async getItems(locationId: string) {
    return lightspeedFetch<{ items: Array<{ id: string; name: string; price: number }> }>(
      `/api/businessLocation/${locationId}/items`
    )
  },
}

// Group raw sale items into aggregated totals per menu item
export function groupSalesByItem(items: LightspeedSaleItem[]) {
  const grouped = new Map<
    string,
    {
      name: string
      id?: string
      qty: number
      total: number
      voids: number
      comps: number
    }
  >()

  for (const item of items) {
    const existing = grouped.get(item.name) ?? {
      name: item.name,
      id: item.id,
      qty: 0,
      total: 0,
      voids: 0,
      comps: 0,
    }

    if (item.quantity < 0) {
      // Negative quantities = voids/comps/refunds
      existing.voids += Math.abs(item.quantity)
    } else {
      existing.qty += item.quantity
      existing.total += item.amount
    }

    grouped.set(item.name, existing)
  }

  return Array.from(grouped.values())
}
