/**
 * Weekly Google review summary — pulled together by Claude, persisted,
 * and emailed to the manager every Friday morning. Covers reviews
 * published in the previous Monday → Sunday window (AEST), grouped by
 * venue. Highlights what's working, what's not, and any specific
 * action items (staff praise/complaints, repeated themes).
 */

import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/gmail/send"
import { VENUE_LABEL } from "@/lib/venues"
import { Venue } from "@/generated/prisma/enums"

interface WeekRange {
  start: Date // Monday 00:00 AEST as UTC instant
  end: Date // Sunday 23:59:59 AEST as UTC instant
  startKey: string // YYYY-MM-DD AEST
  endKey: string // YYYY-MM-DD AEST
}

/**
 * Compute "the most recent completed Mon–Sun week, ending before the
 * Friday of this run" — so the Friday email always covers Mon→Sun of
 * the previous week.
 */
export function lastCompletedWeek(now = new Date()): WeekRange {
  // Convert "now" to AEST date
  const aest = new Date(
    now.toLocaleString("en-US", { timeZone: "Australia/Sydney" })
  )
  // ISO weekday: Mon=1 ... Sun=7
  const weekday = ((aest.getDay() + 6) % 7) + 1
  // Sunday of last week = today minus weekday
  const sunday = new Date(aest)
  sunday.setDate(sunday.getDate() - weekday)
  sunday.setHours(23, 59, 59, 999)
  const monday = new Date(sunday)
  monday.setDate(monday.getDate() - 6)
  monday.setHours(0, 0, 0, 0)

  return {
    start: monday,
    end: sunday,
    startKey: dateKey(monday),
    endKey: dateKey(sunday),
  }
}

function dateKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

const SYSTEM_PROMPT = `You write the Friday morning Google-review digest for the owner of three Gold Coast cafes (Tarte Bakery in Burleigh, Tarte Beach House in Currumbin, Tarte Tea Garden in Currumbin). The owner reads it on her phone; keep it tight, action-oriented, plain English.

Format (Markdown):
# Tarte — Google Reviews, week of {date range}

## Summary
- 1–2 line snapshot of the week across all venues (review count, average rating, biggest signals)

## What's working
- 3–5 specific bullets, each tied to a venue or theme. Cite review text in short quotes where useful.

## What we need to work on
- 3–5 specific bullets. Be direct, not preachy. Highlight any ≤3★ reviews verbatim and what to do about them.

## Staff mentions
- Any named staff (praised or criticised). One line each.

## Per-venue
For each venue with reviews this week:
### {Venue label}
- Stars: {avg this week} ({count} reviews) | Aggregate: {current} ({total} all-time)
- 1–2 sentence summary

## Recommendations
- 2–4 bullet recommendations the owner could action this week.

Rules:
- No filler ("This week was great!"). Lead with substance.
- Quote reviewers sparingly — short fragments only, in quotes.
- If there are no reviews for a venue, omit its section.
- If the whole week had 0 reviews, write a single line saying so.`

export async function generateWeeklySummary(week: WeekRange): Promise<{
  body: string
  reviewCount: number
}> {
  const reviews = await db.googleReview.findMany({
    where: {
      publishTime: { gte: week.start, lte: week.end },
    },
    orderBy: [{ venue: "asc" }, { rating: "asc" }, { publishTime: "asc" }],
    select: {
      venue: true,
      rating: true,
      text: true,
      authorName: true,
      sentiment: true,
      themes: true,
      staffMentions: true,
      taggedSummary: true,
      publishTime: true,
    },
  })

  // Current aggregate ratings for every venue
  const venues = await db.googleVenuePlace.findMany({
    select: {
      venue: true,
      rating: true,
      ratingCount: true,
    },
  })

  if (reviews.length === 0) {
    return {
      body: `# Tarte — Google Reviews, week of ${week.startKey} to ${week.endKey}

No new Google reviews landed this week across any of the three venues. (This is normal during quiet weeks; the daily fetch is still running and will pick up new reviews as they're posted.)
`,
      reviewCount: 0,
    }
  }

  const grouped = new Map<Venue, typeof reviews>()
  for (const r of reviews) {
    const arr = grouped.get(r.venue) ?? []
    arr.push(r)
    grouped.set(r.venue, arr)
  }

  const userPayload = {
    weekRange: { start: week.startKey, end: week.endKey },
    aggregate: venues.map((v) => ({
      venue: VENUE_LABEL[v.venue],
      currentRating: v.rating != null ? Number(v.rating) : null,
      totalRatings: v.ratingCount,
    })),
    perVenue: Array.from(grouped.entries()).map(([venue, items]) => ({
      venue: VENUE_LABEL[venue as Venue],
      thisWeekCount: items.length,
      thisWeekAverage:
        items.reduce((s, r) => s + r.rating, 0) / items.length,
      reviews: items.map((r) => ({
        rating: r.rating,
        sentiment: r.sentiment,
        themes: r.themes,
        staff: r.staffMentions,
        author: r.authorName,
        summary: r.taggedSummary,
        text: r.text,
      })),
    })),
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is the data for this week's digest:\n\n${JSON.stringify(userPayload, null, 2)}`,
      },
    ],
  })

  const body = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()

  return { body, reviewCount: reviews.length }
}

export async function runWeeklySummary(args: {
  recipient: string
  now?: Date
}): Promise<{
  weekStart: string
  weekEnd: string
  reviewCount: number
  emailedTo: string | null
  emailedAt: string | null
  reused: boolean
}> {
  const week = lastCompletedWeek(args.now)

  // If we've already generated this week's summary, reuse the body but
  // still send the email if it hasn't gone out yet.
  const existing = await db.googleReviewWeeklySummary.findUnique({
    where: { weekStart: week.start },
  })

  let summary = existing
  if (!summary) {
    const { body, reviewCount } = await generateWeeklySummary(week)
    summary = await db.googleReviewWeeklySummary.create({
      data: {
        weekStart: week.start,
        weekEnd: week.end,
        reviewCount,
        body,
      },
    })
  }

  let emailedTo = summary.emailedTo
  let emailedAt = summary.emailedAt
  if (!summary.emailedAt && args.recipient) {
    await sendEmail({
      to: args.recipient,
      subject: `Tarte — Google reviews, week of ${week.startKey}`,
      body: summary.body,
    })
    const updated = await db.googleReviewWeeklySummary.update({
      where: { id: summary.id },
      data: { emailedTo: args.recipient, emailedAt: new Date() },
    })
    emailedTo = updated.emailedTo
    emailedAt = updated.emailedAt
  }

  return {
    weekStart: week.startKey,
    weekEnd: week.endKey,
    reviewCount: summary.reviewCount,
    emailedTo,
    emailedAt: emailedAt?.toISOString() ?? null,
    reused: !!existing,
  }
}
