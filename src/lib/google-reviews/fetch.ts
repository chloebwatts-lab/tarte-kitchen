/**
 * Google Places API client + ingestion pipeline.
 *
 * On each fetch we pull the 5 most recent reviews per venue, dedupe by
 * googleReviewId, run a Claude tagging pass on any new ones (sentiment,
 * themes, staff mentions, one-line summary), and snapshot the venue's
 * aggregate rating so we can chart drift over time.
 *
 * Places API New only ever returns the 5 most recent reviews per call,
 * so we don't paginate — we just run this daily and let the table grow.
 */

import { db } from "@/lib/db"
import { tagReview, type ReviewTagging } from "./tagger"

const PLACES_API_BASE = "https://places.googleapis.com/v1"

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

  const place = await fetchPlaceWithReviews(args.placeId)
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

  const reviews = place.reviews ?? []
  result.fetched = reviews.length

  for (const r of reviews) {
    try {
      const existing = await db.googleReview.findUnique({
        where: { googleReviewId: r.name },
        select: { id: true, taggedAt: true },
      })
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
        await db.googleReview.update({
          where: { googleReviewId: r.name },
          data,
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
