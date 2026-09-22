/**
 * Post an owner reply to a Google review via the Business Profile API v4.
 *
 * Only works for reviews that were ingested via GBP (their googleReviewId
 * is a full resource name like "accounts/.../locations/.../reviews/...").
 * Places-API-only reviews return `false` (can't be replied to
 * programmatically: Chloe needs to do those manually in Google Maps).
 */

import { getValidGbpAccessToken, getActiveGbpConnection } from "@/lib/gbp/token"

const GBP_V4 = "https://mybusiness.googleapis.com/v4"

/** Returns true if the review name looks like a GBP resource path. */
function isGbpReviewName(googleReviewId: string): boolean {
  return googleReviewId.startsWith("accounts/")
}

/**
 * Attempt to post a reply.
 *
 * Returns:
 *   { posted: true } , reply posted successfully
 *   { posted: false, reason: string } , can't post (no GBP, wrong id type,
 *     or API error), caller should surface the reason so Chloe can reply
 *     manually from Google Maps Manager.
 */
export async function postGbpReply(
  googleReviewId: string,
  replyText: string
): Promise<{ posted: true } | { posted: false; reason: string }> {
  if (!isGbpReviewName(googleReviewId)) {
    return {
      posted: false,
      reason:
        "This review came via the Places API (not GBP), copy the reply and post it manually in Google Maps.",
    }
  }

  const connection = await getActiveGbpConnection()
  if (!connection) {
    return {
      posted: false,
      reason: "GBP not connected, go to Settings → Integrations to connect.",
    }
  }

  let accessToken: string
  try {
    accessToken = await getValidGbpAccessToken()
  } catch (e) {
    return {
      posted: false,
      reason: `GBP token refresh failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  // PUT /v4/{name}/reply  (upsert, creates or updates an existing reply).
  // The endpoint only accepts PUT; POST returns 404. tarte-seo-engine
  // uses PUT too, we missed it the first time.
  const url = `${GBP_V4}/${googleReviewId}/reply`
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ comment: replyText }),
  })

  if (!res.ok) {
    const body = await res.text()
    // 403 typically means the quota hasn't been granted yet.
    const hint =
      res.status === 403
        ? " (GBP API quota may not be granted yet, check the Google Cloud Console quota page)"
        : ""
    return {
      posted: false,
      reason: `GBP API returned ${res.status}${hint}: ${body.slice(0, 300)}`,
    }
  }

  return { posted: true }
}

/**
 * Read the owner reply that is CURRENTLY live on Google for one review.
 *
 * Two systems post owner replies to the same Google reviews: this app
 * (draft email + /reviews page) and tarte-seo-engine (its own dashboard
 * + hourly publish sweep). GBP's reply endpoint is a PUT upsert, so the
 * second system to post silently REPLACES the first system's reply.
 * Before posting anything we ask Google what is actually live, so an
 * approval here can never overwrite a reply someone already published.
 *
 * Returns `unknown: true` when we can't tell (no GBP connection, token
 * failure, API error). Callers should fall back to the synced
 * `replyText` mirror rather than treating unknown as "no reply".
 */
export async function fetchLiveGbpReply(
  googleReviewId: string
): Promise<
  | { unknown: true; reason: string }
  | { unknown: false; comment: string | null; updateTime: string | null }
> {
  if (!isGbpReviewName(googleReviewId)) {
    return { unknown: true, reason: "not a GBP review name" }
  }

  const connection = await getActiveGbpConnection()
  if (!connection) return { unknown: true, reason: "GBP not connected" }

  let accessToken: string
  try {
    accessToken = await getValidGbpAccessToken()
  } catch (e) {
    return {
      unknown: true,
      reason: `token refresh failed: ${e instanceof Error ? e.message : String(e)}`,
    }
  }

  const res = await fetch(`${GBP_V4}/${googleReviewId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    return { unknown: true, reason: `GBP API returned ${res.status}` }
  }

  const data = (await res.json()) as {
    reviewReply?: { comment?: string; updateTime?: string }
  }
  return {
    unknown: false,
    comment: data.reviewReply?.comment ?? null,
    updateTime: data.reviewReply?.updateTime ?? null,
  }
}
