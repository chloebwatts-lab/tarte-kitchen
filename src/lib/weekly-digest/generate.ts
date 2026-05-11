/**
 * Friday weekly digest — Claude turns the aggregator snapshot into a
 * single phone-readable Markdown email for Chloe.
 *
 * The aggregator does the maths; Claude does the narrative + prioritisation.
 * Tone: lead with substance, plain English, specific numbers, no filler.
 * Negative-news-first per section if applicable.
 */

import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { sendEmail } from "@/lib/gmail/send"
import {
  buildWeeklyDigestSnapshot,
  type WeeklyDigestSnapshot,
} from "./aggregator"

const SYSTEM_PROMPT = `You write Tarte Kitchen's Friday morning business digest. Recipient: Chloe (owner), reads it on her phone before opening Monday.

Output format — Markdown only, no preamble, no code fences.

Required sections, in this order:

# Tarte weekly — {weekStart} to {weekEnd}

## Headline (2-3 lines)
The single most important thing about the week. Lead with what to action, not what to celebrate.

## Sales movement
Total revenue this week vs last week (per venue + overall). Use exact $ figures. Flag any venue with >5% WoW drop.

## Wages vs target
For each venue, list each department group with $ and % of revenue, comparing to the target band. Use ✅ inside band, ⚠️ within 0.5pp, 🚩 outside. If a row is over by >1pp, add a one-line "Likely cause / fix" guess.

## COGS
Per venue COGS % vs target. Flag biggest category mover.

## Wastage
Total $ wasted this week, WoW delta. Top 5 items by $. Highlight any recurring offenders (3+ days same item).

## Supplier price increases
Top 5 increases this week by % or absolute $. If something jumped >15% flag for re-quote.

## Top sellers
Per venue, top 5 by quantity. Note any new entrants vs last week.

## Google reviews
Aggregate star + this-week star + count, per venue. List every ≤3★ review verbatim (short quote, attribute by first name). 2-3 lines on themes and any staff praise/criticism.

## Action list (3-6 bullets)
Concrete actions Chloe could take this week, ranked by impact.

Rules:
- Specific numbers always. Never "sales were good" — say "sales $32,180 ex-GST, up 4.2%".
- Owner tone: confident, direct, no preachy framing.
- If a section has no data, write "(no data this week)" rather than skip — keeps the structure stable.
- Negative news first within each section if applicable.
- Keep total length under ~2,500 words.`

export async function generateWeeklyDigest(
  snapshot: WeeklyDigestSnapshot
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Here is this week's data snapshot. Generate the Friday digest:\n\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ],
  })
  const body = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
  return body
}

export interface RunWeeklyDigestArgs {
  recipient: string
  now?: Date
  forceRegenerate?: boolean
}

export async function runWeeklyDigest(args: RunWeeklyDigestArgs): Promise<{
  weekStart: string
  weekEnd: string
  reviewCount: number
  emailedTo: string | null
  emailedAt: string | null
  reused: boolean
}> {
  const snapshot = await buildWeeklyDigestSnapshot(args.now)

  const weekStartDate = new Date(`${snapshot.weekStart}T00:00:00Z`)
  const weekEndDate = new Date(`${snapshot.weekEnd}T00:00:00Z`)

  const existing = await db.weeklyDigest.findUnique({
    where: { weekStart: weekStartDate },
  })

  let digest = existing
  if (!digest || args.forceRegenerate) {
    const body = await generateWeeklyDigest(snapshot)

    // Per-venue overall labour % avg (skip nulls)
    const labourPcts = snapshot.labour.perVenue
      .map((v) => v.overallPct)
      .filter((x): x is number => x != null)
    const cogsPcts = snapshot.cogs.perVenue
      .map((v) => v.cogsPct)
      .filter((x): x is number => x != null)

    const data = {
      weekStart: weekStartDate,
      weekEnd: weekEndDate,
      reviewCount: snapshot.reviews.totalCount,
      reviewAvgRating: snapshot.reviews.averageRating ?? null,
      salesTotal: snapshot.sales.totalThisWeek,
      salesWowPct: snapshot.sales.wowChangePct ?? null,
      cogsAvgPct: cogsPcts.length
        ? cogsPcts.reduce((s, n) => s + n, 0) / cogsPcts.length
        : null,
      labourAvgPct: labourPcts.length
        ? labourPcts.reduce((s, n) => s + n, 0) / labourPcts.length
        : null,
      wastageTotal: snapshot.wastage.totalDollarsThisWeek,
      priceSpikeCount: snapshot.priceSpikes.count,
      body,
      // Prisma 7 accepts plain JSON for Json fields
      sourceJson: snapshot as unknown as object,
    }

    digest = existing
      ? await db.weeklyDigest.update({ where: { id: existing.id }, data })
      : await db.weeklyDigest.create({ data })
  }

  let emailedTo = digest.emailedTo
  let emailedAt = digest.emailedAt
  if (!digest.emailedAt && args.recipient) {
    await sendEmail({
      to: args.recipient,
      subject: `Tarte weekly — ${snapshot.weekStart} to ${snapshot.weekEnd}`,
      body: digest.body,
    })
    const updated = await db.weeklyDigest.update({
      where: { id: digest.id },
      data: { emailedTo: args.recipient, emailedAt: new Date() },
    })
    emailedTo = updated.emailedTo
    emailedAt = updated.emailedAt
  }

  return {
    weekStart: snapshot.weekStart,
    weekEnd: snapshot.weekEnd,
    reviewCount: snapshot.reviews.totalCount,
    emailedTo,
    emailedAt: emailedAt?.toISOString() ?? null,
    reused: !!existing && !args.forceRegenerate,
  }
}
