/**
 * /api/reviews/reply — review-reply approval handler (links in approval emails).
 *
 * GET ?token=X&action=approve  → mark APPROVED + post to GBP (or fallback)
 * GET ?token=X&action=skip     → mark SKIPPED
 * GET ?token=X&action=edit     → render edit page (form POSTs back here)
 * POST ?token=X                → read editedReply from form, run approve
 *                                flow with the edited text
 *
 * Linked from email, so output is HTML pages, not JSON.
 */

export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { postGbpReply } from "@/lib/gbp/post-reply"
import { VENUE_SHORT_LABEL } from "@/lib/venues"
import type { Venue } from "@/generated/prisma/enums"

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

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
    .card{max-width:560px;margin:0 auto;background:#fff;border:1px solid #d9d2c4;border-radius:10px;padding:32px;}
    h2{margin:0 0 8px;font-size:20px;}
    p{margin:0 0 16px;color:#4a4641;line-height:1.6;}
    .tag{display:inline-block;padding:3px 10px;border-radius:20px;font-size:13px;font-weight:600;margin-bottom:16px;}
    .green{background:#eef2e7;color:#4f5b3f;}
    .grey{background:#ece6da;color:#4a4641;}
    .reply-box{background:#f5f0e8;border:1px solid #d9d2c4;border-radius:6px;padding:14px;font-size:14px;line-height:1.6;white-space:pre-wrap;margin-bottom:12px;}
    a.btn,button.btn{display:inline-block;margin-top:4px;padding:10px 20px;background:#4f5b3f;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;margin-right:8px;border:none;cursor:pointer;font-size:14px;font-family:inherit;}
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

const PLACE_IDS: Record<string, string> = {
  BURLEIGH:    "ChIJAbYJBO8DkWsRZ5m-ig7obYg",
  BEACH_HOUSE: "ChIJuYHYFzEDkWsRje1pQyA0F-U",
  TEA_GARDEN:  "ChIJX5GpejcDkWsR_z5Ncuq4sVc",
}

async function loadReview(token: string | null) {
  if (!token) return null
  return db.googleReview.findUnique({ where: { replyToken: token } })
}

function alreadyActionedPage(review: { replyStatus: string | null; replyPostedAt: Date | null }) {
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
  return null
}

async function runApprove(
  review: NonNullable<Awaited<ReturnType<typeof loadReview>>>,
  replyText: string,
) {
  const venueName = VENUE_SHORT_LABEL[review.venue as Venue] ?? review.venue

  // Persist the (possibly edited) text + mark APPROVED before we post,
  // so a double-submit doesn't post twice.
  await db.googleReview.update({
    where: { id: review.id },
    data: {
      replyStatus: "APPROVED",
      approvedAt: new Date(),
      draftReply: replyText,
    },
  })

  const result = await postGbpReply(review.googleReviewId, replyText)

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
      <div class="reply-box">${escapeHtml(replyText)}</div>
      <a class="btn" href="https://kitchen.tarte.com.au/reviews">View reviews</a>`
    )
  }

  // GBP post failed — show the text with one-click copy + direct link to Google reviews.
  const placeId = PLACE_IDS[review.venue]
  const googleUrl = placeId
    ? `https://search.google.com/local/reviews?placeid=${placeId}`
    : "https://business.google.com/reviews"

  return htmlPage(
    "Reply ready to post",
    `<h2>Reply approved ✓</h2>
    <span class="tag green">Approved</span>
    <p style="margin-top:12px;">${venueName} · ${review.rating}/5${review.authorName ? ` · ${review.authorName}` : ""}</p>
    <p style="margin-bottom:8px;color:#4a4641;">We couldn't auto-post (${escapeHtml(result.reason)}). Copy the reply, then click <strong>Open Google reviews</strong> to paste it in.</p>
    <div class="reply-box" id="reply-text">${escapeHtml(replyText)}</div>
    <button class="copy-btn">Copy reply</button>
    <a class="btn" href="${googleUrl}" target="_blank" rel="noopener">Open Google reviews &rarr;</a>`
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")
  const action = searchParams.get("action")

  if (!token || (action !== "approve" && action !== "skip" && action !== "edit")) {
    return htmlPage(
      "Invalid link",
      `<h2>Invalid link</h2><p>This link is missing required parameters. Please use the links from the review approval email.</p>`
    )
  }

  const review = await loadReview(token)
  if (!review) {
    return htmlPage(
      "Link not found",
      `<h2>Link not found</h2><p>This approval link is invalid or has already been used.</p>`
    )
  }

  const alreadyDone = alreadyActionedPage(review)
  if (alreadyDone) return alreadyDone

  const venueName = VENUE_SHORT_LABEL[review.venue as Venue] ?? review.venue

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

  if (action === "edit") {
    if (!review.draftReply) {
      return htmlPage(
        "No draft found",
        `<h2>No draft reply found</h2><p>Something went wrong — the draft reply is missing.</p>`
      )
    }
    const reviewText = review.text ?? "(no review text)"
    return htmlPage(
      "Edit reply",
      `<h2>Edit before posting</h2>
      <p style="margin-bottom:12px;">${venueName} · ${review.rating}/5${review.authorName ? ` · ${escapeHtml(review.authorName)}` : ""}</p>
      <div style="background:#f5f0e8;border:1px solid #d9d2c4;border-radius:6px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#4a4641;line-height:1.55;white-space:pre-wrap;">
        <div style="font-size:11px;color:#8a857c;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px;">Their review</div>
        ${escapeHtml(reviewText)}
      </div>
      <form method="POST" action="/api/reviews/reply?token=${encodeURIComponent(token)}">
        <label for="r" style="display:block;font-size:13px;color:#4a4641;margin-bottom:6px;">Reply (edit anything, then post)</label>
        <textarea id="r" name="editedReply" rows="9" required
          style="width:100%;box-sizing:border-box;padding:12px;font-size:14px;line-height:1.55;font-family:inherit;color:#1f1d1a;border:1px solid #d9d2c4;border-radius:6px;background:#fff;resize:vertical;">${escapeHtml(review.draftReply)}</textarea>
        <div style="margin-top:14px;">
          <button type="submit" class="btn">✓ Approve &amp; Post</button>
          <a class="btn" href="/api/reviews/reply?token=${encodeURIComponent(token)}&action=skip"
             style="background:#fff;color:#4a4641;border:1px solid #d9d2c4;margin-left:6px;">Skip</a>
        </div>
      </form>`
    )
  }

  // action === "approve" — one-click, no edit
  if (!review.draftReply) {
    return htmlPage(
      "No draft found",
      `<h2>No draft reply found</h2><p>Something went wrong — the draft reply is missing. Please reply manually in Google Maps.</p>`
    )
  }
  return runApprove(review, review.draftReply)
}

export async function POST(req: NextRequest) {
  // Form submission from the Edit page. Token is in the query string;
  // the textarea name is `editedReply`.
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")
  const form = await req.formData()
  const editedReply = (form.get("editedReply") as string | null)?.trim() ?? ""

  if (!token || !editedReply) {
    return htmlPage(
      "Invalid submission",
      `<h2>Invalid submission</h2><p>The reply text was empty. Go back and try again.</p>`
    )
  }

  const review = await loadReview(token)
  if (!review) {
    return htmlPage(
      "Link not found",
      `<h2>Link not found</h2><p>This approval link is invalid or has already been used.</p>`
    )
  }

  const alreadyDone = alreadyActionedPage(review)
  if (alreadyDone) return alreadyDone

  return runApprove(review, editedReply)
}
