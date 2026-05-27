export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getValidGbpAccessToken, getActiveGbpConnection } from "@/lib/gbp/token"

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4"

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveGbpConnection()
  if (!connection) return Response.json({ error: "No GBP connection" }, { status: 400 })

  const results: Record<string, unknown> = {
    connectionId: connection.id,
    accountNameCached: connection.accountName,
    email: connection.email,
  }

  let accessToken: string
  try {
    accessToken = await getValidGbpAccessToken()
    results.tokenOk = true
  } catch (e) {
    results.tokenError = e instanceof Error ? e.message : String(e)
    return Response.json(results)
  }

  // 1. List accounts (all types)
  try {
    const accountsUrl = new URL(`${ACCOUNT_MGMT_BASE}/accounts`)
    accountsUrl.searchParams.set("pageSize", "20")
    const accountsRes = await fetch(accountsUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
    const accountsText = await accountsRes.text()
    results.accountsStatus = accountsRes.status
    results.accountsRaw = accountsText
  } catch (e) {
    results.accountsError = e instanceof Error ? e.message : String(e)
  }

  if (connection.accountName) {
    // 2. Business Information API v1 locations
    try {
      const locsUrl = new URL(`${BUSINESS_INFO_BASE}/${connection.accountName}/locations`)
      locsUrl.searchParams.set("readMask", "name,title,metadata")
      locsUrl.searchParams.set("pageSize", "100")
      const locsRes = await fetch(locsUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
      const locsText = await locsRes.text()
      results.locationsStatus = locsRes.status
      results.locationsRaw = locsText
    } catch (e) {
      results.locationsError = e instanceof Error ? e.message : String(e)
    }

    // 3. Legacy v4 API locations
    try {
      const v4LocsUrl = new URL(`${REVIEWS_BASE}/${connection.accountName}/locations`)
      v4LocsUrl.searchParams.set("pageSize", "20")
      const v4LocsRes = await fetch(v4LocsUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
      const v4LocsText = await v4LocsRes.text()
      results.v4LocationsStatus = v4LocsRes.status
      results.v4LocationsRaw = v4LocsText
    } catch (e) {
      results.v4LocationsError = e instanceof Error ? e.message : String(e)
    }

    // 4. Account Management sub-accounts/locations
    try {
      const subAccUrl = new URL(`${ACCOUNT_MGMT_BASE}/${connection.accountName}/locations`)
      subAccUrl.searchParams.set("pageSize", "20")
      const subAccRes = await fetch(subAccUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
      const subAccText = await subAccRes.text()
      results.acctMgmtLocationsStatus = subAccRes.status
      results.acctMgmtLocationsRaw = subAccText
    } catch (e) {
      results.acctMgmtLocationsError = e instanceof Error ? e.message : String(e)
    }
  }

  // 5. LOCATION_GROUP filter on accounts
  try {
    const lgUrl = new URL(`${ACCOUNT_MGMT_BASE}/accounts`)
    lgUrl.searchParams.set("pageSize", "20")
    lgUrl.searchParams.set("filter", "type=LOCATION_GROUP")
    const lgRes = await fetch(lgUrl.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    })
    const lgText = await lgRes.text()
    results.locationGroupsStatus = lgRes.status
    results.locationGroupsRaw = lgText
  } catch (e) {
    results.locationGroupsError = e instanceof Error ? e.message : String(e)
  }

  return Response.json(results)
}
