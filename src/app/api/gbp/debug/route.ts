export const dynamic = "force-dynamic"

import { NextRequest } from "next/server"
import { getValidGbpAccessToken, getActiveGbpConnection } from "@/lib/gbp/token"
import { db } from "@/lib/db"

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const REVIEWS_BASE_NEW = "https://mybusinessreviews.googleapis.com/v1"

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

  const accountName = connection.accountName ?? "accounts/114937924472617520672"
  const results: Record<string, unknown> = { accountName }

  // 1. Admins for our account (are there co-admins? is there an owner?)
  results.accountAdmins = await tryFetch(
    `${ACCOUNT_MGMT_BASE}/${accountName}/admins`,
    accessToken
  )

  // 2. Invitations (any pending manager invites for locations we don't yet own?)
  results.invitations = await tryFetch(
    `${ACCOUNT_MGMT_BASE}/${accountName}/invitations`,
    accessToken
  )

  // 3. New Reviews API — wildcard location (- = all locations)
  results.reviewsWildcard = await tryFetch(
    `${REVIEWS_BASE_NEW}/${accountName}/locations/-/reviews?pageSize=5`,
    accessToken
  )

  // 4. googleLocations:search for all 3 venues
  const venues = await db.googleVenuePlace.findMany({ select: { placeId: true, venue: true } })
  const searches: Record<string, unknown> = {}
  for (const v of venues) {
    const res = await fetch(`${BUSINESS_INFO_BASE}/googleLocations:search`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pageSize: 3, query: v.venue.replace(/_/g, " ").toLowerCase() }),
      cache: "no-store",
    })
    searches[v.venue] = { status: res.status, placeId: v.placeId, body: await res.text() }
  }
  results.venueSearches = searches

  // 5. Try fetching a specific googleLocation by placeId (Beach House)
  const beachHousePlaceId = "ChIJuYHYFzEDkWsRje1pQyA0F-U"
  results.googleLocationGet = await tryFetch(
    `${BUSINESS_INFO_BASE}/googleLocations/${beachHousePlaceId}?readMask=name,title,metadata`,
    accessToken
  )

  // 6. Try new Reviews API with placeId as location ID (wild guess, might 404)
  results.reviewsByPlaceId = await tryFetch(
    `${REVIEWS_BASE_NEW}/${accountName}/locations/${beachHousePlaceId}/reviews?pageSize=3`,
    accessToken
  )

  // 7. List locations but with `filter` param to show all states
  results.locsWithFilter = await tryFetch(
    `${BUSINESS_INFO_BASE}/${accountName}/locations?readMask=name,title,metadata&filter=locationState.isPublished%3Dtrue`,
    accessToken
  )

  return Response.json(results)
}
