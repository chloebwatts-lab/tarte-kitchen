/**
 * Post an owner reply to a Google review via the Business Profile API v4.
 *
 * Only works for reviews that were ingested via GBP (their googleReviewId
 * is a full resource name like "accounts/.../locations/.../reviews/...").
 * Places-API-only reviews return `false` (can't be replied to
 * programmatically — Chloe needs to do those manually in Google Maps).
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
 *   { posted: true }  — reply posted successfully
 *   { posted: false, reason: string }  — can't post (no GBP, wrong id type,
 *     or API error) — caller should surface the reason so Chloe can reply
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
        "This review came via the Places API (not GBP) — copy the reply and post it manually in Google Maps.",
    }
  }

  const connection = await getActiveGbpConnection()
  if (!connection) {
    return {
      posted: false,
      reason: "GBP not connected — go to Settings → Integrations to connect.",
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

  // POST /v4/{name}/reply  (upsert — creates or updates an existing reply)
  const url = `${GBP_V4}/${googleReviewId}/reply`
  const res = await fetch(url, {
    method: "POST",
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
        ? " (GBP API quota may not be granted yet — check the Google Cloud Console quota page)"
        : ""
    return {
      posted: false,
      reason: `GBP API returned ${res.status}${hint}: ${body.slice(0, 300)}`,
    }
  }

  return { posted: true }
}
