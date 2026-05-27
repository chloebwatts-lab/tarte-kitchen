export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getValidGbpAccessToken, getActiveGbpConnection } from "@/lib/gbp/token"

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"

async function tryFetch(url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  return { status: res.status, body: await res.text() }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  const connection = await getActiveGbpConnection()
  if (!connection) return Response.json({ error: "No GBP connection" }, { status: 400 })

  let accessToken: string
  try {
    accessToken = await getValidGbpAccessToken()
  } catch (e) {
    return Response.json({ tokenError: e instanceof Error ? e.message : String(e) })
  }

  const results: Record<string, unknown> = {}

  // Userinfo — confirm which Google account we're authed as
  const ui = await tryFetch("https://openidconnect.googleapis.com/v1/userinfo", accessToken)
  results.userinfo = ui

  // accounts/me — special alias for the authenticated user's account
  const me = await tryFetch(
    `${BUSINESS_INFO_BASE}/accounts/me/locations?readMask=name,title,metadata`,
    accessToken
  )
  results.accountsMeLocations = me

  // accounts/me via Account Management
  const meAcct = await tryFetch(`${ACCOUNT_MGMT_BASE}/accounts/me`, accessToken)
  results.accountsMeAcctMgmt = meAcct

  // All accounts from Account Management (no pageSize limit)
  const allAccts = await tryFetch(`${ACCOUNT_MGMT_BASE}/accounts`, accessToken)
  results.allAccounts = allAccts

  // Locations on the cached account with no filter (control)
  if (connection.accountName) {
    const locs = await tryFetch(
      `${BUSINESS_INFO_BASE}/${connection.accountName}/locations?readMask=name,title,metadata`,
      accessToken
    )
    results.cachedAccountLocs = locs

    // Try with filter=locationState.isPublished=true
    const locsFiltered = await tryFetch(
      `${BUSINESS_INFO_BASE}/${connection.accountName}/locations?readMask=name&filter=`,
      accessToken
    )
    results.cachedAccountLocsEmptyFilter = locsFiltered

    // googleLocations:search by placeId (Beach House)
    const searchRes = await fetch(
      `${BUSINESS_INFO_BASE}/googleLocations:search`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pageSize: 5,
          query: "Tarte Beach House Currumbin",
        }),
        cache: "no-store",
      }
    )
    results.googleLocationsSearch = {
      status: searchRes.status,
      body: await searchRes.text(),
    }
  }

  return Response.json(results)
}
