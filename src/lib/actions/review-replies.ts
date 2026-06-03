"use server"

/**
 * Server actions for the /reviews dashboard's inline reply UI.
 *
 *   approveReply(id, editedText?)  — edit-then-post in one motion
 *   skipReply(id)                  — mark SKIPPED, no post
 *
 * Mirrors the email-link handler in /api/reviews/reply, but takes a
 * review id (not a per-row token) since the dashboard already
 * authenticates Chloe via basic auth.
 */

import { db } from "@/lib/db"
import { postGbpReply } from "@/lib/gbp/post-reply"
import { revalidatePath } from "next/cache"

export type ReplyActionResult =
  | { ok: true; posted: true }
  | { ok: true; posted: false; reason: string }
  | { ok: false; error: string }

export async function approveReply(
  id: string,
  editedText?: string
): Promise<ReplyActionResult> {
  const review = await db.googleReview.findUnique({
    where: { id },
    select: {
      id: true,
      googleReviewId: true,
      draftReply: true,
      replyStatus: true,
    },
  })
  if (!review) return { ok: false, error: "Review not found" }
  if (review.replyStatus === "POSTED") {
    return { ok: true, posted: true }
  }

  const finalText = (editedText?.trim() || review.draftReply?.trim()) ?? ""
  if (!finalText) return { ok: false, error: "No reply text to post" }

  // Persist any edit + mark approved BEFORE the API call. If the API
  // call fails we still want the edit saved and the row APPROVED so a
  // retry doesn't ask Chloe to re-edit.
  await db.googleReview.update({
    where: { id },
    data: {
      draftReply: finalText,
      replyStatus: "APPROVED",
      approvedAt: new Date(),
    },
  })

  const result = await postGbpReply(review.googleReviewId, finalText)

  if (result.posted) {
    await db.googleReview.update({
      where: { id },
      data: {
        replyStatus: "POSTED",
        replyPostedAt: new Date(),
        replyText: finalText, // mirror the live owner reply for the feed
      },
    })
    revalidatePath("/reviews")
    return { ok: true, posted: true }
  }

  revalidatePath("/reviews")
  return { ok: true, posted: false, reason: result.reason }
}

export async function skipReply(id: string): Promise<ReplyActionResult> {
  const review = await db.googleReview.findUnique({
    where: { id },
    select: { id: true, replyStatus: true },
  })
  if (!review) return { ok: false, error: "Review not found" }

  await db.googleReview.update({
    where: { id },
    data: { replyStatus: "SKIPPED" },
  })
  revalidatePath("/reviews")
  return { ok: true, posted: false, reason: "Skipped" }
}
