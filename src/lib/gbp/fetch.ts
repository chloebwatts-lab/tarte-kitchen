/**
 * Google Business Profile API reviews ingestion. Replaces the 5-cap
 * Places API path with a paginated fetch of *all* reviews per venue.
 *
 * APIs touched:
 *   - Account Management v1: list /accounts (we cache the result on
 *     GbpConnection.accountName so cron runs aren't N+1).
 *   - Business Information v1: list /accounts/X/locations to discover
 *     each location's resource name + Maps placeId — used to bind our
 *     existing GoogleVenuePlace rows (which already have a placeId)
 *     to a GBP location automatically. No manual mapping UI needed.
 *   - My Business v4 (legacy, not migrated, still supported): list
 *     /accounts/X/locations/Y/reviews — paginated, all reviews, sorted
 *     by updateTime desc.
 */

import { db } from "@/lib/db"
import { getValidGbpAccessToken, getActiveGbpConnection } from "./token"
import { tagReview, type ReviewTagging } from "@/lib/google-reviews/tagger"
import type { Venue } from "@/generated/prisma/enums"
import { ReviewSentiment } from "@/generated/prisma/enums"

const ACCOUNT_MGMT_BASE = "https://mybusinessaccountmanagement.googleapis.com/v1"
const BUSINESS_INFO_BASE = "https://mybusinessbusinessinformation.googleapis.com/v1"
const REVIEWS_BASE = "https://mybusiness.googleapis.com/v4"

interface GbpAccount {
  name: string // "accounts/12345"
  accountName?: string
  type?: string
}

interface GbpLocation {
  name: string // "locations/67890" (NB: relative under the account)
  title?: string
  metadata?: { placeId?: string }
}

interface GbpReview {
  reviewId?: string
  name?: string // "accounts/X/locations/Y/reviews/Z"
  reviewer?: {
    displayName?: string
    profilePhotoUrl?: string
    isAnonymous?: boolean
  }
  starRating?: "ONE" | "TWO" | "THREE" | "FOUR" | "FIVE"
  comment?: string
  createTime?: string
  updateTime?: string
  reviewReply?: { comment?: string; updateTime?: string }
}

const STAR_TO_INT: Record<NonNullable<GbpReview["starRating"]>, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
}

async function gbpFetch<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  })
  if (!res.ok) {
    throw new Error(`GBP ${url} ${res.status}: ${(await res.text()).slice(0, 400)}`)
  }
  return res.json() as Promise<T>
}

/**
 * Returns the GBP account resource name to ingest from. The first call
 * after OAuth lists /accounts and caches the result on GbpConnection.
 * Subsequent calls short-circuit on the cached value.
 *
 * If the authorising user is a member of multiple GBP accounts we pick
 * the first one that owns at least one location matching one of our
 * GoogleVenuePlace placeIds — that handles the common case where
 * Chloe's account has a personal listing + the Tarte business account.
 */
export async function resolveGbpAccountName(
  accessToken: string
): Promise<string> {
  const connection = await getActiveGbpConnection()
  if (!connection) throw new Error("No GBP connection")
  if (connection.accountName) return connection.accountName

  const accounts: GbpAccount[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${ACCOUNT_MGMT_BASE}/accounts`)
    url.searchParams.set("pageSize", "20")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const data = await gbpFetch<{ accounts?: GbpAccount[]; nextPageToken?: string }>(
      url.toString(),
      accessToken
    )
    if (data.accounts) accounts.push(...data.accounts)
    pageToken = data.nextPageToken
  } while (pageToken)

  if (accounts.length === 0) {
    throw new Error("No GBP accounts visible to this connection")
  }

  // If only one, the choice is trivial.
  let chosen = accounts[0].name
  if (accounts.length > 1) {
    const ourPlaceIds = new Set(
      (await db.googleVenuePlace.findMany({ select: { placeId: true } })).map(
        (p) => p.placeId
      )
    )
    for (const acc of accounts) {
      const locs = await listLocations(accessToken, acc.name)
      if (locs.some((l) => l.metadata?.placeId && ourPlaceIds.has(l.metadata.placeId))) {
        chosen = acc.name
        break
      }
    }
  }

  await db.gbpConnection.update({
    where: { id: connection.id },
    data: { accountName: chosen },
  })
  return chosen
}

export async function listLocations(
  accessToken: string,
  accountName: string
): Promise<GbpLocation[]> {
  const out: GbpLocation[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${BUSINESS_INFO_BASE}/${accountName}/locations`)
    url.searchParams.set("readMask", "name,title,metadata.placeId")
    url.searchParams.set("pageSize", "100")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const data = await gbpFetch<{ locations?: GbpLocation[]; nextPageToken?: string }>(
      url.toString(),
      accessToken
    )
    if (data.locations) out.push(...data.locations)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

/**
 * Auto-bind every GoogleVenuePlace to its GBP location by matching on
 * the shared Google Maps placeId. The GBP API exposes placeId in each
 * location's metadata; ours is stored on GoogleVenuePlace. Run once
 * post-OAuth and again on every cron tick (cheap and self-healing if
 * the GBP listing's location resource changes).
 */
export async function syncLocationBindings(): Promise<{
  bound: Array<{ venue: Venue; placeId: string; gbpLocationName: string }>
  unmatchedVenues: string[]
  unmatchedGbpPlaceIds: string[]
}> {
  const accessToken = await getValidGbpAccessToken()
  const accountName = await resolveGbpAccountName(accessToken)
  const locations = await listLocations(accessToken, accountName)

  const venues = await db.googleVenuePlace.findMany()
  const byPlaceId = new Map(venues.map((v) => [v.placeId, v]))
  const usedPlaceIds = new Set<string>()
  const bound: Array<{ venue: Venue; placeId: string; gbpLocationName: string }> = []

  for (const loc of locations) {
    const placeId = loc.metadata?.placeId
    if (!placeId) continue
    const venue = byPlaceId.get(placeId)
    if (!venue) continue
    // The GBP location.name is relative — "locations/123". We want it
    // fully qualified under the account so the reviews endpoint works.
    const fullName = `${accountName}/${loc.name}`
    if (venue.gbpLocationName !== fullName) {
      await db.googleVenuePlace.update({
        where: { id: venue.id },
        data: { gbpLocationName: fullName },
      })
    }
    usedPlaceIds.add(placeId)
    bound.push({ venue: venue.venue, placeId, gbpLocationName: fullName })
  }

  return {
    bound,
    unmatchedVenues: venues
      .filter((v) => !usedPlaceIds.has(v.placeId))
      .map((v) => v.venue),
    unmatchedGbpPlaceIds: locations
      .filter((l) => l.metadata?.placeId && !usedPlaceIds.has(l.metadata.placeId))
      .map((l) => l.metadata!.placeId!),
  }
}

async function listAllReviews(
  accessToken: string,
  locationFullName: string
): Promise<GbpReview[]> {
  const out: GbpReview[] = []
  let pageToken: string | undefined
  do {
    const url = new URL(`${REVIEWS_BASE}/${locationFullName}/reviews`)
    url.searchParams.set("pageSize", "50")
    url.searchParams.set("orderBy", "updateTime desc")
    if (pageToken) url.searchParams.set("pageToken", pageToken)
    const data = await gbpFetch<{ reviews?: GbpReview[]; nextPageToken?: string }>(
      url.toString(),
      accessToken
    )
    if (data.reviews) out.push(...data.reviews)
    pageToken = data.nextPageToken
  } while (pageToken)
  return out
}

export interface IngestVenueGbpResult {
  venue: Venue
  placeId: string
  gbpLocationName: string
  fetched: number
  newReviews: number
  taggedReviews: number
  errors: string[]
}

async function ingestVenueGbp(
  accessToken: string,
  args: { venue: Venue; placeId: string; gbpLocationName: string }
): Promise<IngestVenueGbpResult> {
  const result: IngestVenueGbpResult = {
    venue: args.venue,
    placeId: args.placeId,
    gbpLocationName: args.gbpLocationName,
    fetched: 0,
    newReviews: 0,
    taggedReviews: 0,
    errors: [],
  }

  let reviews: GbpReview[]
  try {
    reviews = await listAllReviews(accessToken, args.gbpLocationName)
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e))
    return result
  }
  result.fetched = reviews.length

  for (const r of reviews) {
    try {
      const reviewName = r.name ?? `${args.gbpLocationName}/reviews/${r.reviewId}`
      const rating = r.starRating ? STAR_TO_INT[r.starRating] : 0
      if (!rating) continue
      const publishTime = r.createTime ? new Date(r.createTime) : new Date()
      const author = r.reviewer?.displayName?.trim() ?? null
      const text = r.comment?.trim() || null

      // Dedupe against rows previously ingested via Places API. Match
      // by content identity (placeId + publishTime second + author)
      // before touching the unique googleReviewId, so the same review
      // returned by both providers ends up as one row, not two.
      const existingByContent = author
        ? await db.googleReview.findFirst({
            where: {
              placeId: args.placeId,
              publishTime: {
                gte: new Date(publishTime.getTime() - 2000),
                lte: new Date(publishTime.getTime() + 2000),
              },
              authorName: { equals: author, mode: "insensitive" },
            },
            select: { id: true, googleReviewId: true, taggedAt: true },
          })
        : null
      const existing =
        existingByContent ??
        (await db.googleReview.findUnique({
          where: { googleReviewId: reviewName },
          select: { id: true, googleReviewId: true, taggedAt: true },
        }))

      if (existing?.taggedAt) continue

      let tagging: ReviewTagging | null = null
      if (text && text.length > 0) {
        tagging = await tagReview({
          venue: args.venue,
          rating,
          text,
          authorName: author ?? undefined,
        })
        result.taggedReviews++
      }

      const data = {
        placeId: args.placeId,
        venue: args.venue,
        googleReviewId: reviewName,
        authorName: author,
        authorUri: null,
        authorPhotoUri: r.reviewer?.profilePhotoUrl ?? null,
        rating,
        text,
        originalText: null,
        languageCode: null,
        publishTime,
        relativePublishTime: null,
        replyText: r.reviewReply?.comment ?? null,
        replyTime: r.reviewReply?.updateTime
          ? new Date(r.reviewReply.updateTime)
          : null,
        sentiment: tagging?.sentiment ?? null,
        themes: tagging?.themes ?? [],
        staffMentions: tagging?.staffMentions ?? [],
        taggedSummary: tagging?.summary ?? null,
        taggedAt: tagging ? new Date() : null,
      }

      if (existing) {
        // If the existing row was ingested via Places API (places/... id),
        // upgrade its googleReviewId to the GBP resource name so the Approve
        // button can hit /v4/{name}/reply. Otherwise preserve the existing
        // id (some GBP review names rotate updateTime but keep reviewId).
        const upgradeId = existing.googleReviewId.startsWith("places/")
        await db.googleReview.update({
          where: { id: existing.id },
          data: {
            ...data,
            googleReviewId: upgradeId ? reviewName : existing.googleReviewId,
          },
        })
      } else {
        await db.googleReview.create({ data })
        result.newReviews++
      }
    } catch (e) {
      result.errors.push(
        `Review ${r.reviewId ?? r.name}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  // Best-effort sentiment touch-up: GBP doesn't expose Google's
  // aggregate star average — leave the GoogleVenuePlace.rating snapshot
  // to the Places API pass (still cheap to call alongside).
  return result
}

export async function ingestAllVenuesGbp(): Promise<{
  bindings: Awaited<ReturnType<typeof syncLocationBindings>>
  results: IngestVenueGbpResult[]
}> {
  const accessToken = await getValidGbpAccessToken()
  const bindings = await syncLocationBindings()
  const results: IngestVenueGbpResult[] = []
  for (const b of bindings.bound) {
    results.push(await ingestVenueGbp(accessToken, b))
  }
  // Touch lastSyncAt so the settings UI can show recency.
  const connection = await getActiveGbpConnection()
  if (connection) {
    await db.gbpConnection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date() },
    })
  }
  return { bindings, results }
}

// Re-exported for the cron route — keeps Tagger off the
// ReviewSentiment-equals path inadvertently.
export { ReviewSentiment }
