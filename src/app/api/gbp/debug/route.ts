export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getValidGbpAccessToken, getActiveGbpConnection } from "@/lib/gbp/token"

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"

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

  // 1. List accounts
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

  // 2. List locations for the cached account (if any)
  if (connection.accountName) {
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

    // 3. Try with just readMask=name
    try {
      const locsUrl2 = new URL(`${BUSINESS_INFO_BASE}/${connection.accountName}/locations`)
      locsUrl2.searchParams.set("readMask", "name")
      locsUrl2.searchParams.set("pageSize", "10")
      const locsRes2 = await fetch(locsUrl2.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      })
      const locsText2 = await locsRes2.text()
      results.locationsNameOnlyStatus = locsRes2.status
      results.locationsNameOnlyRaw = locsText2
    } catch (e) {
      results.locationsNameOnlyError = e instanceof Error ? e.message : String(e)
    }
  }

  return Response.json(results)
}
