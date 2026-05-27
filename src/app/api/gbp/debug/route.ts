export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getValidGbpAccessToken, getActiveGbpConnection } from "@/lib/gbp/token"

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"

async function tryFetch(label: string, url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  return { label, status: res.status, body: await res.text() }
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

  const accountName = connection.accountName ?? "accounts/114937924472617520672"
  const results = []

  // 1. listLocations with storeCode filter (Beach House store code from business.google.com)
  results.push(await tryFetch(
    "listLocs_storeCode",
    `${BUSINESS_INFO_BASE}/${accountName}/locations?readMask=name,title,metadata&filter=storeCode%3D"06968006077302605827"`,
    accessToken
  ))

  // 2. listLocations with no readMask — error might be more revealing
  results.push(await tryFetch(
    "listLocs_noReadMask",
    `${BUSINESS_INFO_BASE}/${accountName}/locations`,
    accessToken
  ))

  // 3. Legacy v3 My Business API
  results.push(await tryFetch(
    "v3_locations",
    `https://mybusiness.googleapis.com/v3/${accountName}/locations?pageSize=10`,
    accessToken
  ))

  // 4. googleLocations:search with precise queries for each venue
  const searches = [
    { label: "search_beachhouse", query: "Tarte Beach House Currumbin Gold Coast" },
    { label: "search_burleigh", query: "Tarte Bakery Cafe Burleigh Heads Gold Coast" },
    { label: "search_teagarden", query: "Tarte Tea Garden Gold Coast" },
  ]
  for (const s of searches) {
    const res = await fetch(`${BUSINESS_INFO_BASE}/googleLocations:search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pageSize: 3, query: s.query }),
      cache: "no-store",
    })
    results.push({ label: s.label, status: res.status, body: await res.text() })
  }

  // 5. Try accounts.locations.list on Account Management side (not Business Info)
  results.push(await tryFetch(
    "acctMgmt_listLocs_withMask",
    `${ACCOUNT_MGMT_BASE}/${accountName}/locations?readMask=name,locationName,primaryPhone`,
    accessToken
  ))

  // 6. Account Management — list all accounts Chloe can access (with parentAccount filter)
  results.push(await tryFetch(
    "accounts_noFilter",
    `${ACCOUNT_MGMT_BASE}/accounts?pageSize=50`,
    accessToken
  ))

  return Response.json(results)
}
