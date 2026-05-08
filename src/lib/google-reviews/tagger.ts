/**
 * Claude tagging pass for individual Google reviews. Returns sentiment,
 * theme tags, staff mentions, and a one-line summary so the dashboard
 * list is scannable at a glance.
 */

import Anthropic from "@anthropic-ai/sdk"
import { ReviewSentiment, ReviewTheme } from "@/generated/prisma/enums"

const VALID_THEMES = Object.values(ReviewTheme) as ReviewTheme[]
const VALID_SENTIMENTS = Object.values(ReviewSentiment) as ReviewSentiment[]

export interface ReviewTagging {
  sentiment: ReviewSentiment
  themes: ReviewTheme[]
  staffMentions: string[]
  summary: string
}

const SYSTEM_PROMPT = `You are tagging Google reviews for a small group of cafes (Tarte Bakery, Beach House, Tea Garden — Gold Coast, AU). Output strict JSON only — no preamble, no code fences, no commentary.

Schema:
{
  "sentiment": "POSITIVE" | "NEGATIVE" | "MIXED" | "NEUTRAL",
  "themes": ReviewTheme[],
  "staffMentions": string[],
  "summary": string  // one short sentence, ≤ 140 chars
}

ReviewTheme is one of: ${VALID_THEMES.join(", ")}.

Rules:
- Pick 1–4 themes that are clearly evidenced in the text. If nothing fits, use ["OTHER"].
- staffMentions = first names of any staff explicitly named in the review (lowercased, deduped). Empty array if none.
- summary captures the reviewer's main point in plain English, e.g. "Loved the croissants but waited 20 min for coffee."
- sentiment NEGATIVE for ≤2★ or strongly critical text; POSITIVE for ≥4★ + clearly positive; MIXED if both sides; NEUTRAL only if genuinely neutral.`

export async function tagReview(input: {
  venue: string
  rating: number
  text: string
  authorName?: string
}): Promise<ReviewTagging> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const userMessage = [
    `Venue: ${input.venue}`,
    `Star rating: ${input.rating}/5`,
    input.authorName ? `Author: ${input.authorName}` : null,
    ``,
    `Review text:`,
    input.text,
  ]
    .filter(Boolean)
    .join("\n")

  const res = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userMessage },
      { role: "assistant", content: "{" },
    ],
  })

  const text = res.content
    .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
    .map((b) => b.text)
    .join("")

  const raw = "{" + text
  let parsed: unknown
  try {
    // Trim anything after the closing brace, in case Claude added stray output
    const lastBrace = raw.lastIndexOf("}")
    parsed = JSON.parse(lastBrace >= 0 ? raw.slice(0, lastBrace + 1) : raw)
  } catch (e) {
    throw new Error(
      `Tagger returned non-JSON: ${raw.slice(0, 200)} (${(e as Error).message})`
    )
  }

  return normalise(parsed, input.rating)
}

function normalise(obj: unknown, fallbackRating: number): ReviewTagging {
  const o = (obj ?? {}) as Record<string, unknown>
  const sentimentRaw = String(o.sentiment ?? "").toUpperCase()
  const sentiment = (VALID_SENTIMENTS as string[]).includes(sentimentRaw)
    ? (sentimentRaw as ReviewSentiment)
    : fallbackSentiment(fallbackRating)

  const themesIn = Array.isArray(o.themes) ? o.themes : []
  const themes = themesIn
    .map((t) => String(t).toUpperCase())
    .filter((t): t is ReviewTheme => (VALID_THEMES as string[]).includes(t))

  const staffIn = Array.isArray(o.staffMentions) ? o.staffMentions : []
  const staffMentions = Array.from(
    new Set(
      staffIn
        .map((s) => String(s).trim().toLowerCase())
        .filter((s) => s.length > 0 && s.length <= 40)
    )
  )

  const summary = String(o.summary ?? "").slice(0, 200) || ""

  return {
    sentiment,
    themes: themes.length > 0 ? themes : [ReviewTheme.OTHER],
    staffMentions,
    summary,
  }
}

function fallbackSentiment(rating: number): ReviewSentiment {
  if (rating >= 4) return ReviewSentiment.POSITIVE
  if (rating <= 2) return ReviewSentiment.NEGATIVE
  return ReviewSentiment.NEUTRAL
}
