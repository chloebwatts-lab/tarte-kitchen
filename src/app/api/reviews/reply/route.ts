/**
 * GET /api/reviews/reply?token=<replyToken>&action=approve|skip
 *
 * One-click approve/skip handler for the review reply approval emails.
 *
 * approve → marks the review APPROVED, attempts to post to Google via
 *           GBP API. If GBP isn't available, returns the draft text so
 *           Chloe can paste it into Google Maps manually.
 * skip    → marks the review SKIPPED. No reply is posted.
 *
 * Returns a simple HTML page (this is a link clicked in email, not an
 * API call from the app).
 */

export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { postGbpReply } from "@/lib/gbp/post-reply"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma/enums"

function htmlPage(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title} — Tarte Kitchen</title>
  <style>
    body{margin:0;padding:40px 24px;background:#f5f0e8;font-family:sans-serif;color:#1f1d1a;}
    .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #d9d2c4;border-radius:10px;padding:32px;}
    h2{margin:0 0 8px;font-size:20px;}
    p{margin:0 0 16px;color:#4a4641;line-height:1.6;}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px;}
    .green{background:#eef2e7;color:#4f5b3f;}
    .grey{background:#ece6da;color:#4a4641;}
    .reply-box{background:#f5f0e8;border:1px solid #d9d2c4;border-radius:6px;padding:14px;font-size:14px;line-height:1.6;white-space:pre-wrap;margin-bottom:12px;}
    a.btn{display:inline-block;margin-top:4px;padding:10px 20px;background:#4f5b3f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin-right:8px;}
    button.copy-btn{padding:10px 20px;background:#fff;color:#4a4641;border:1px solid #d9d2c4;border-radius:6px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px;}
    button.copy-btn.copied{background:#eef2e7;color:#4f5b3f;border-color:#4f5b3f;}
  </style>
</head>
<body>
  <div class="card">${body}</div>
  <script>
    document.querySelectorAll('.copy-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var text = document.getElementById('reply-text').innerText;
        navigator.clipboard.writeText(text).then(function() {
          btn.textContent = 'Copied!';
          btn.classList.add('copied');
          setTimeout(function(){ btn.textContent = 'Copy reply'; btn.classList.remove('copied'); }, 2000);
        });
      });
    });
  </script>
</body>
</html>`,
    { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")
  const action = searchParams.get("action")

  if (!token || (action !== "approve" && action !== "skip")) {
    return htmlPage(
      "Invalid link",
      `<h2>Invalid link</h2><p>This link is missing required parameters. Please use the links from the review approval email.</p>`
    )
  }

  const review = await db.googleReview.findUnique({
    where: { replyToken: token },
  })

  if (!review) {
    return htmlPage(
      "Link not found",
      `<h2>Link not found</h2><p>This approval link is invalid or has already been used.</p>`
    )
  }

  // Already actioned — show current state.
  if (review.replyStatus === "APPROVED" || review.replyStatus === "POSTED") {
    return htmlPage(
      "Already approved",
      `<h2>Already approved</h2>
      <p>This reply was already approved${review.replyPostedAt ? " and posted to Google" : ""}.</p>
      <a class="btn" href="https://kitchen.tarte.com.au/reviews">View reviews</a>`
    )
  }
  if (review.replyStatus === "SKIPPED") {
    return htmlPage(
      "Already skipped",
      `<h2>Already skipped</h2>
      <p>This review was marked as skipped.</p>
      <a class="btn" href="https://kitchen.tarte.com.au/reviews">View reviews</a>`
    )
  }

  const venueName = VENUE_SHORT_LABEL[review.venue] ?? review.venue

  if (action === "skip") {
    await db.googleReview.update({
      where: { id: review.id },
      data: { replyStatus: "SKIPPED" },
    })
    return htmlPage(
      "Skipped",
      `<h2>Review skipped</h2>
      <span class="tag grey">Skipped</span>
      <p>${venueName} · ${review.rating}/5${review.authorName ? ` · ${review.authorName}` : ""}</p>
      <p>No reply will be posted. You can always reply manually in Google Maps.</p>
      <a class="btn" href="https://kitchen.tarte.com.au/reviews">View reviews</a>`
    )
  }

  // action === "approve"
  if (!review.draftReply) {
    return htmlPage(
      "No draft found",
      `<h2>No draft reply found</h2><p>Something went wrong — the draft reply is missing. Please reply manually in Google Maps.</p>`
    )
  }

  // Mark approved immediately so double-clicks don't double-post.
  await db.googleReview.update({
    where: { id: review.id },
    data: { replyStatus: "APPROVED", approvedAt: new Date() },
  })

  // Attempt GBP post.
  const result = await postGbpReply(review.googleReviewId, review.draftReply)

  if (result.posted) {
    await db.googleReview.update({
      where: { id: review.id },
      data: { replyStatus: "POSTED", replyPostedAt: new Date() },
    })
    return htmlPage(
      "Reply posted",
      `<h2>Reply posted to Google ✓</h2>
      <span class="tag green">Posted</span>
      <p>${venueName} · ${review.rating}/5${review.authorName ? ` · ${review.authorName}` : ""}</p>
      <p>Your reply is now live on Google:</p>
      <div class="reply-box">${review.draftReply}</div>
      <a class="btn" href="https://kitchen.tarte.com.au/reviews">View reviews</a>`
    )
  }

  // GBP post failed — show the text with one-click copy + direct link to Google reviews.
  const PLACE_IDS: Record<string, string> = {
    BURLEIGH:    "ChIJAbYJBO8DkWsRZ5m-ig7obYg",
    BEACH_HOUSE: "ChIJuYHYFzEDkWsRje1pQyA0F-U",
    TEA_GARDEN:  "ChIJX5GpejcDkWsR_z5Ncuq4sVc",
  }
  const placeId = PLACE_IDS[review.venue]
  const googleUrl = placeId
    ? `https://search.google.com/local/reviews?placeid=${placeId}`
    : "https://business.google.com/reviews"

  return htmlPage(
    "Reply ready to post",
    `<h2>Reply approved ✓</h2>
    <span class="tag green">Approved</span>
    <p style="margin-top:12px;">${venueName} · ${review.rating}/5${review.authorName ? ` · ${review.authorName}` : ""}</p>
    <p style="margin-bottom:8px;color:#4a4641;">Copy the reply, then click <strong>Open Google reviews</strong> to paste it in.</p>
    <div class="reply-box" id="reply-text">${review.draftReply.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
    <button class="copy-btn">Copy reply</button>
    <a class="btn" href="${googleUrl}" target="_blank" rel="noopener">Open Google reviews &rarr;</a>`
  )
}
