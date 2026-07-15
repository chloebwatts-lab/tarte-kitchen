/**
 * Friday weekly digest — produces a polished HTML email for Chloe.
 *
 * Two-stage design:
 *   1. Aggregator (this file's `buildWeeklyDigestSnapshot`) does the maths.
 *   2. Claude generates ONLY narrative bits (headline + per-section
 *      subtitles + action items) as JSON. The renderer
 *      (`html-renderer.ts`) lays out the actual email using the
 *      structured data, so the layout is reliable and the AI never
 *      hand-writes tables/HTML.
 *
 * Recipient is owner-only — never accounts@. See tarte_recipients.md.
 */

import Anthropic from "@anthropic-ai/sdk"
import { db } from "@/lib/db"
import { sendHtmlEmail } from "@/lib/gmail/send"
import {
  buildWeeklyDigestSnapshot,
  type WeeklyDigestSnapshot,
} from "./aggregator"
import {
  renderDigestHtml,
  renderDigestText,
  type DigestNarrative,
} from "./html-renderer"

const NARRATIVE_SYSTEM = `You write the narrative bits for Tarte Kitchen's Friday weekly digest. The renderer lays out tables, tiles and structure separately — your job is JUST the prose. Output strict JSON only — no preamble, no code fences.

Schema:
{
  "headline": string,           // 1-2 sentences, lead with the single most important thing to act on
  "sectionNotes": {
    "sales"?: string,           // 1-2 sentence interpretation, e.g. "Burleigh down 7% on quieter weekday mornings"
    "wages"?: string,
    "cogs"?: string,
    "wastage"?: string,
    "prices"?: string,
    "topSellers"?: string,
    "reviews"?: string,       // if responseWatch shows unanswered negatives or median response over 2 days, lead with that
    "operations"?: string  // 1-2 sentences on checklist completion + any temp/cooling breaches. Lead with breaches if any.
  },
  "actionItems": string[]       // 3-6 concrete actions ranked by impact
}

Tone rules:
- Owner-to-owner. Confident, direct, plain English. No "great week!" filler.
- Reference specific numbers from the data (the renderer is already showing tables — your prose should call out the most important number in each section).
- If a section has no data, set its note to a short explanation ("No POS sync this week — labour ratio can't be cross-checked.") so the reader knows why it's empty rather than guessing.
- Negative news first within each section if relevant.
- Phone-readable: keep each section note under ~30 words. Headline under 50.
- Action items: each one specific and doable this week (e.g. "Re-quote olive oil — Bidfood up 18% since April"). Avoid generic advice ("monitor wastage closely").`

async function generateNarrative(
  snapshot: WeeklyDigestSnapshot
): Promise<DigestNarrative> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: NARRATIVE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Generate the digest narrative for this snapshot:\n\n${JSON.stringify(snapshot, null, 2)}`,
      },
    ],
  })

  const raw = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()

  const stripped = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim()
  const first = stripped.indexOf("{")
  const last = stripped.lastIndexOf("}")
  const jsonText =
    first >= 0 && last > first ? stripped.slice(first, last + 1) : stripped

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(
      `Narrative returned non-JSON: ${raw.slice(0, 300)} (${(e as Error).message})`
    )
  }
  return normaliseNarrative(parsed)
}

function normaliseNarrative(o: unknown): DigestNarrative {
  const obj = (o ?? {}) as Record<string, unknown>
  const sectionNotesRaw = (obj.sectionNotes ?? {}) as Record<string, unknown>
  const noteKeys = [
    "sales",
    "wages",
    "cogs",
    "wastage",
    "prices",
    "topSellers",
    "reviews",
    "operations",
  ] as const
  const sectionNotes: DigestNarrative["sectionNotes"] = {}
  for (const k of noteKeys) {
    const v = sectionNotesRaw[k]
    if (typeof v === "string" && v.trim().length > 0) sectionNotes[k] = v.trim()
  }
  const actions = Array.isArray(obj.actionItems)
    ? obj.actionItems
        .filter((x): x is string => typeof x === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .slice(0, 8)
    : []
  return {
    headline:
      typeof obj.headline === "string" && obj.headline.trim().length > 0
        ? obj.headline.trim()
        : "Weekly digest is below.",
    sectionNotes,
    actionItems: actions,
  }
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
    const narrative = await generateNarrative(snapshot)
    const html = renderDigestHtml(snapshot, narrative)

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
      body: html,
      sourceJson: { snapshot, narrative } as unknown as object,
      // Clear the emailedAt so the new (regenerated) digest gets re-sent.
      ...(args.forceRegenerate ? { emailedTo: null, emailedAt: null } : {}),
    }

    digest = existing
      ? await db.weeklyDigest.update({ where: { id: existing.id }, data })
      : await db.weeklyDigest.create({ data })
  }

  let emailedTo = digest.emailedTo
  let emailedAt = digest.emailedAt
  if (!digest.emailedAt && args.recipient) {
    const stored = (digest.sourceJson ?? null) as {
      snapshot?: WeeklyDigestSnapshot
      narrative?: DigestNarrative
    } | null
    const fallbackText = stored?.snapshot && stored?.narrative
      ? renderDigestText(stored.snapshot, stored.narrative)
      : "Open https://kitchen.tarte.com.au/dashboard to view this week's digest."

    await sendHtmlEmail({
      to: args.recipient,
      subject: `Tarte weekly: ${formatSubjectRange(snapshot.weekStart, snapshot.weekEnd)}`,
      html: digest.body,
      text: fallbackText,
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

function formatSubjectRange(start: string, end: string): string {
  const s = new Date(`${start}T00:00:00`)
  const e = new Date(`${end}T00:00:00`)
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  return `${s.toLocaleDateString("en-AU", opts)} - ${e.toLocaleDateString("en-AU", opts)}`
}
