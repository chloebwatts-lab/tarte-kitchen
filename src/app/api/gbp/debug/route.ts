export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getValidGbpAccessToken } from "@/lib/gbp/token"

const ACCOUNT_ID = "accounts/114937924472617520672"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const REVIEWS_V1 = "https://mybusinessreviews.googleapis.com/v1"
const REVIEWS_V4 = "https://mybusiness.googleapis.com/v4"

// Profile IDs grabbed from Advanced settings in Google Search
const LOCATION_IDS: Record<string, string> = {
  BEACH_HOUSE: "7802297045976491251",
  BURLEIGH: "12625663879942109096",
}

async function tryFetch(label: string, url: string, accessToken: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  const text = await res.text()
  let body: unknown
  try { body = JSON.parse(text) } catch { body = text.slice(0, 300) }
  return { label, status: res.status, body }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }

  let accessToken: string
  try {
    accessToken = await getValidGbpAccessToken()
  } catch (e) {
    return Response.json({ tokenError: e instanceof Error ? e.message : String(e) })
  }

  const results = []

  for (const [venue, locId] of Object.entries(LOCATION_IDS)) {
    const locName = `${ACCOUNT_ID}/locations/${locId}`

    // 1. Business Info GET (specific location — not list)
    results.push(await tryFetch(
      `${venue}_bizinfo_get`,
      `${BUSINESS_INFO_BASE}/${locName}?readMask=name,title,metadata`,
      accessToken
    ))

    // 2. New Reviews API (v1)
    results.push(await tryFetch(
      `${venue}_reviews_v1`,
      `${REVIEWS_V1}/${locName}/reviews?pageSize=3`,
      accessToken
    ))

    // 3. Old v4 Reviews (known 404 but trying specific location)
    results.push(await tryFetch(
      `${venue}_reviews_v4`,
      `${REVIEWS_V4}/${locName}/reviews?pageSize=3`,
      accessToken
    ))
  }

  return Response.json(results)
}
