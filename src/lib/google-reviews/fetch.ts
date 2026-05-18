/**
 * Google Places API client + ingestion pipeline.
 *
 * Per venue per run we issue TWO calls:
 *   1. Places API v1 (new) — top-5 "most relevant" reviews + the
 *      aggregate rating snapshot + owner replies (v1 is the only one
 *      that returns `authorReply`).
 *   2. Legacy Places API with `reviews_sort=newest` — the 5 most
 *      recently published reviews. v1 has no review-sort param, so
 *      without this second call brand-new reviews never surface once
 *      five popular older reviews squat the top of the relevance list.
 *
 * Results are merged by (placeId, publishTime second, authorName) so a
 * review returned by both APIs is stored once. New ones go through the
 * Claude tagging pass (sentiment, themes, staff mentions, summary).
 */

import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import { tagReview, type ReviewTagging } from "./tagger"

const PLACES_API_BASE = "https://places.googleapis.com/v1"
const LEGACY_PLACES_BASE = "https://maps.googleapis.com/maps/api/place/details/json"

type RawReview = {
  name: string // "places/<placeId>/reviews/<reviewId>"
  rating: number
  text?: { text: string; languageCode?: string }
  originalText?: { text: string; languageCode?: string }
  publishTime?: string
  relativePublishTimeDescription?: string
  authorAttribution?: {
    displayName?: string
    uri?: string
    photoUri?: string
  }
  authorReply?: {
    text?: { text: string; languageCode?: string }
    publishTime?: string
  }
}

type RawPlace = {
  id: string
  rating?: number
  userRatingCount?: number
  displayName?: { text: string }
  formattedAddress?: string
  reviews?: RawReview[]
}

function getKey(): string {
  const k = process.env.GOOGLE_PLACES_API_KEY
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY is not set")
  return k
}

async function fetchPlaceWithReviews(placeId: string): Promise<RawPlace> {
  const url = `${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`
  const fields = [
    "id",
    "displayName",
    "formattedAddress",
    "rating",
    "userRatingCount",
    "reviews",
  ].join(",")
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": getKey(),
      "X-Goog-FieldMask": fields,
    },
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Places API ${placeId} ${res.status}: ${body.slice(0, 400)}`
    )
  }
  return (await res.json()) as RawPlace
}

type LegacyReview = {
  author_name?: string
  author_url?: string
  profile_photo_url?: string
  language?: string
  original_language?: string
  rating: number
  relative_time_description?: string
  text?: string
  time: number // unix seconds
  translated?: boolean
}

type LegacyDetailsResponse = {
  status: string
  error_message?: string
  result?: {
    rating?: number
    user_ratings_total?: number
    name?: string
    formatted_address?: string
    reviews?: LegacyReview[]
  }
}

async function fetchNewestReviewsLegacy(placeId: string): Promise<RawReview[]> {
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "reviews",
    reviews_sort: "newest",
    reviews_no_translations: "true",
    key: getKey(),
  })
  const res = await fetch(`${LEGACY_PLACES_BASE}?${params}`, {
    cache: "no-store",
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `Legacy Places API ${placeId} ${res.status}: ${body.slice(0, 400)}`
    )
  }
  const json = (await res.json()) as LegacyDetailsResponse
  if (json.status !== "OK" && json.status !== "ZERO_RESULTS") {
    throw new Error(
      `Legacy Places API ${placeId} status=${json.status}: ${json.error_message ?? ""}`
    )
  }
  const reviews = json.result?.reviews ?? []
  return reviews.map((r) => legacyToRaw(placeId, r))
}

function legacyToRaw(placeId: string, r: LegacyReview): RawReview {
  // Legacy reviews have no opaque review ID; synthesize a stable one
  // from (time, author_url|author_name). v1 IDs look like
  // "places/<pid>/reviews/<opaque>" — we use a distinct namespace so we
  // never collide with a real Google ID, and resolveReviewIdentity()
  // below merges with any pre-existing v1 row for the same review.
  const authorKey = r.author_url || r.author_name || "anon"
  const authorHash = createHash("sha1")
    .update(authorKey)
    .digest("hex")
    .slice(0, 12)
  const syntheticId = `places/${placeId}/reviews-legacy/${r.time}-${authorHash}`
  return {
    name: syntheticId,
    rating: r.rating,
    text: r.text ? { text: r.text, languageCode: r.language } : undefined,
    publishTime: new Date(r.time * 1000).toISOString(),
    relativePublishTimeDescription: r.relative_time_description,
    authorAttribution: {
      displayName: r.author_name,
      uri: r.author_url,
      photoUri: r.profile_photo_url,
    },
  }
}

function mergeReviews(v1: RawReview[], legacy: RawReview[]): RawReview[] {
  // Dedupe by content identity: same (publishTime second, authorName).
  // Prefer the v1 entry when both exist — it carries the opaque Google
  // review ID and any owner reply (legacy API exposes neither).
  const byKey = new Map<string, RawReview>()
  const keyOf = (r: RawReview) => {
    const t = r.publishTime ? new Date(r.publishTime).getTime() : 0
    const a = (r.authorAttribution?.displayName ?? "").trim().toLowerCase()
    return `${Math.floor(t / 1000)}|${a}`
  }
  for (const r of legacy) byKey.set(keyOf(r), r)
  for (const r of v1) byKey.set(keyOf(r), r) // v1 wins
  return Array.from(byKey.values())
}

export interface IngestVenueResult {
  placeId: string
  venue: string
  fetched: number
  newReviews: number
  taggedReviews: number
  ratingSnapshot: number | null
  errors: string[]
}

export async function ingestVenueReviews(args: {
  placeId: string
  venue: "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
}): Promise<IngestVenueResult> {
  const result: IngestVenueResult = {
    placeId: args.placeId,
    venue: args.venue,
    fetched: 0,
    newReviews: 0,
    taggedReviews: 0,
    ratingSnapshot: null,
    errors: [],
  }

  const [place, newestLegacy] = await Promise.all([
    fetchPlaceWithReviews(args.placeId),
    fetchNewestReviewsLegacy(args.placeId).catch((e) => {
      result.errors.push(
        `Legacy newest fetch: ${e instanceof Error ? e.message : String(e)}`
      )
      return [] as RawReview[]
    }),
  ])
  const fetchedAt = new Date()

  // Update aggregate rating snapshot
  await db.googleVenuePlace.update({
    where: { placeId: args.placeId },
    data: {
      rating: place.rating != null ? place.rating : null,
      ratingCount: place.userRatingCount ?? null,
      lastFetchedAt: fetchedAt,
      ...(place.displayName?.text
        ? { displayName: place.displayName.text }
        : {}),
      ...(place.formattedAddress
        ? { formattedAddress: place.formattedAddress }
        : {}),
    },
  })
  await db.googleRatingSnapshot.create({
    data: {
      placeId: args.placeId,
      venue: args.venue,
      rating: place.rating != null ? place.rating : null,
      ratingCount: place.userRatingCount ?? null,
      fetchedAt,
    },
  })
  result.ratingSnapshot = place.rating ?? null

  const reviews = mergeReviews(place.reviews ?? [], newestLegacy)
  result.fetched = reviews.length

  for (const r of reviews) {
    try {
      const existing = await resolveExistingReview(args.placeId, r)
      if (existing && existing.taggedAt) {
        // Already ingested + tagged; skip.
        continue
      }

      const reviewText = r.text?.text ?? r.originalText?.text ?? ""
      const publishTime = r.publishTime
        ? new Date(r.publishTime)
        : approximatePublishTime(r.relativePublishTimeDescription, fetchedAt)

      // Tag with Claude (only if we have text to tag)
      let tagging: ReviewTagging | null = null
      if (reviewText.trim().length > 0) {
        tagging = await tagReview({
          venue: args.venue,
          rating: r.rating,
          text: reviewText,
          authorName: r.authorAttribution?.displayName,
        })
        result.taggedReviews++
      }

      const data = {
        placeId: args.placeId,
        venue: args.venue,
        googleReviewId: r.name,
        authorName: r.authorAttribution?.displayName ?? null,
        authorUri: r.authorAttribution?.uri ?? null,
        authorPhotoUri: r.authorAttribution?.photoUri ?? null,
        rating: r.rating,
        text: reviewText || null,
        originalText: r.originalText?.text ?? null,
        languageCode: r.text?.languageCode ?? r.originalText?.languageCode ?? null,
        publishTime,
        relativePublishTime: r.relativePublishTimeDescription ?? null,
        replyText: r.authorReply?.text?.text ?? null,
        replyTime: r.authorReply?.publishTime
          ? new Date(r.authorReply.publishTime)
          : null,
        sentiment: tagging?.sentiment ?? null,
        themes: tagging?.themes ?? [],
        staffMentions: tagging?.staffMentions ?? [],
        taggedSummary: tagging?.summary ?? null,
        taggedAt: tagging ? new Date() : null,
      }

      if (existing) {
        // Update by the row's actual id — `r.name` may be a legacy-
        // synthesized id that doesn't match an existing v1-stored row
        // we matched on content (publishTime + author).
        await db.googleReview.update({
          where: { id: existing.id },
          data: {
            ...data,
            // Keep the original (typically v1) googleReviewId rather
            // than overwriting with our legacy-synthesized id.
            googleReviewId: existing.googleReviewId,
          },
        })
      } else {
        await db.googleReview.create({ data })
        result.newReviews++
      }
    } catch (e) {
      result.errors.push(
        `Review ${r.name}: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  return result
}

export async function ingestAllVenues(): Promise<IngestVenueResult[]> {
  const places = await db.googleVenuePlace.findMany({
    select: { placeId: true, venue: true },
  })
  const out: IngestVenueResult[] = []
  for (const p of places) {
    try {
      out.push(
        await ingestVenueReviews({
          placeId: p.placeId,
          venue: p.venue as IngestVenueResult["venue"] extends string
            ? "BURLEIGH" | "BEACH_HOUSE" | "TEA_GARDEN"
            : never,
        })
      )
    } catch (e) {
      out.push({
        placeId: p.placeId,
        venue: p.venue,
        fetched: 0,
        newReviews: 0,
        taggedReviews: 0,
        ratingSnapshot: null,
        errors: [e instanceof Error ? e.message : String(e)],
      })
    }
  }
  return out
}

/**
 * Best-effort backfill of publishTime when the API only returned a
 * relative description like "6 months ago". Anchors to the fetch
 * timestamp and parses the simple "N <unit> ago" pattern. Falls back
 * to the fetch time itself for unparseable values.
 */
function approximatePublishTime(
  relative: string | undefined,
  fetchedAt: Date
): Date {
  if (!relative) return fetchedAt
  const m = relative.match(
    /(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago/i
  )
  if (!m) {
    if (/^a\s+(minute|hour|day|week|month|year)\s+ago/i.test(relative)) {
      const unit = relative.match(
        /(minute|hour|day|week|month|year)/i
      )?.[1]
      return shiftBack(fetchedAt, 1, unit?.toLowerCase() ?? "")
    }
    return fetchedAt
  }
  return shiftBack(fetchedAt, Number(m[1]), m[2].toLowerCase())
}

/**
 * Find a pre-existing DB row for an incoming raw review. First tries an
 * exact match on googleReviewId (covers re-fetches of the same review
 * from the same API), then falls back to a content-identity lookup
 * (placeId + publishTime second + lower-cased author name) so a review
 * already stored under a v1 opaque ID doesn't get re-inserted as a
 * legacy-synthesized duplicate (and vice-versa).
 */
async function resolveExistingReview(
  placeId: string,
  r: RawReview
): Promise<{ id: string; googleReviewId: string; taggedAt: Date | null } | null> {
  const byId = await db.googleReview.findUnique({
    where: { googleReviewId: r.name },
    select: { id: true, googleReviewId: true, taggedAt: true },
  })
  if (byId) return byId

  const author = r.authorAttribution?.displayName?.trim()
  if (!r.publishTime || !author) return null
  const ts = new Date(r.publishTime)
  // ±2s window to absorb sub-second rounding between v1 and legacy.
  const lo = new Date(ts.getTime() - 2000)
  const hi = new Date(ts.getTime() + 2000)
  return db.googleReview.findFirst({
    where: {
      placeId,
      publishTime: { gte: lo, lte: hi },
      authorName: { equals: author, mode: "insensitive" },
    },
    select: { id: true, googleReviewId: true, taggedAt: true },
  })
}

function shiftBack(base: Date, n: number, unit: string): Date {
  const d = new Date(base)
  switch (unit) {
    case "minute":
      d.setMinutes(d.getMinutes() - n)
      break
    case "hour":
      d.setHours(d.getHours() - n)
      break
    case "day":
      d.setDate(d.getDate() - n)
      break
    case "week":
      d.setDate(d.getDate() - 7 * n)
      break
    case "month":
      d.setMonth(d.getMonth() - n)
      break
    case "year":
      d.setFullYear(d.getFullYear() - n)
      break
  }
  return d
}
