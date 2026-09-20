/**
 * SEO scoreboard: the two or three lines of search numbers in the Friday
 * digest.
 *
 * The numbers live in the SEO engine (a separate repo and database on the
 * same droplet). It pushes a small JSON snapshot to
 * /api/internal/seo-scoreboard, which is stored in AppSetting under
 * SEO_SCOREBOARD_KEY. The digest only ever reads that stored snapshot, so a
 * dead feed shows up as an old "as at" date, never as made-up numbers.
 *
 * What is live and what is not (be honest in the email):
 *   - Google ratings and Google posts: pushed by the SEO engine each morning,
 *     straight from the Google Business Profile API and its own post log.
 *   - Search Console clicks and pages indexed: Google gives no API feed we
 *     have connected, so they are read by hand at the monthly re-check and
 *     typed into the SEO engine's docs/content/seo-scoreboard.json. Each line
 *     carries its own "as at" date.
 */

import { db } from "@/lib/db"

export const SEO_SCOREBOARD_KEY = "seo.scoreboard"

export interface SeoRating {
  /** "Beach House" | "Burleigh", display name chosen by the sender. */
  label: string
  reviewCount: number
  starSum: number
}

export interface SeoScoreboardPayload {
  /** ISO timestamp the SEO engine built this snapshot. */
  generatedAt: string
  searchConsole: {
    /** Date the numbers were read off Search Console, YYYY-MM-DD. */
    readOn: string
    /** End of the 3 month window the clicks cover, YYYY-MM-DD. */
    windowEnd: string
    clicks3mo: number
    previous: { windowEnd: string; clicks3mo: number } | null
    pagesIndexed: number
    pagesNotIndexed: number
  } | null
  ratings: SeoRating[]
  posts: {
    windowDays: number
    published: Array<{ label: string; count: number }>
    draftsWaiting: number
  } | null
}

export interface SeoRatingLine {
  label: string
  reviewCount: number
  /** True mean to 4 decimals, e.g. 4.5595. */
  exact: number
  /** What Google shows: the mean rounded to one decimal. */
  displayed: number
  /** Net 1-star reviews that would drop the displayed rating a tier. */
  oneStarsToDrop: number
  /** Straight 5-star reviews needed to lift the displayed rating a tier. */
  fiveStarsToRise: number | null
}

export interface SeoSection {
  available: boolean
  /** YYYY-MM-DD (Brisbane) the SEO engine last pushed, null when never. */
  pushedOn: string | null
  /** Days since that push at digest time. Over 3 means the feed has stalled. */
  pushAgeDays: number | null
  searchConsole:
    | (NonNullable<SeoScoreboardPayload["searchConsole"]> & { changePct: number | null })
    | null
  ratings: SeoRatingLine[]
  posts: SeoScoreboardPayload["posts"]
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Validate an incoming push. Returns the cleaned payload or an error string. */
export function parseSeoScoreboardPayload(raw: unknown): SeoScoreboardPayload | string {
  if (!raw || typeof raw !== "object") return "body must be a JSON object"
  const o = raw as Record<string, unknown>
  if (typeof o.generatedAt !== "string" || isNaN(Date.parse(o.generatedAt))) {
    return "generatedAt must be an ISO timestamp"
  }

  let searchConsole: SeoScoreboardPayload["searchConsole"] = null
  if (o.searchConsole != null) {
    const s = o.searchConsole as Record<string, unknown>
    if (
      typeof s.readOn !== "string" || !DATE_RE.test(s.readOn) ||
      typeof s.windowEnd !== "string" || !DATE_RE.test(s.windowEnd) ||
      !isFiniteNumber(s.clicks3mo) || !isFiniteNumber(s.pagesIndexed) || !isFiniteNumber(s.pagesNotIndexed)
    ) {
      return "searchConsole needs readOn, windowEnd (YYYY-MM-DD), clicks3mo, pagesIndexed, pagesNotIndexed"
    }
    let previous: { windowEnd: string; clicks3mo: number } | null = null
    if (s.previous != null) {
      const p = s.previous as Record<string, unknown>
      if (typeof p.windowEnd !== "string" || !DATE_RE.test(p.windowEnd) || !isFiniteNumber(p.clicks3mo)) {
        return "searchConsole.previous needs windowEnd (YYYY-MM-DD) and clicks3mo"
      }
      previous = { windowEnd: p.windowEnd, clicks3mo: p.clicks3mo }
    }
    searchConsole = {
      readOn: s.readOn,
      windowEnd: s.windowEnd,
      clicks3mo: s.clicks3mo,
      previous,
      pagesIndexed: s.pagesIndexed,
      pagesNotIndexed: s.pagesNotIndexed,
    }
  }

  const ratings: SeoRating[] = []
  if (o.ratings != null) {
    if (!Array.isArray(o.ratings)) return "ratings must be an array"
    for (const r of o.ratings as Array<Record<string, unknown>>) {
      if (
        !r || typeof r.label !== "string" || !r.label.trim() ||
        !isFiniteNumber(r.reviewCount) || !isFiniteNumber(r.starSum) ||
        r.reviewCount <= 0 || r.starSum < r.reviewCount || r.starSum > r.reviewCount * 5
      ) {
        return "each rating needs label, reviewCount and a starSum between 1x and 5x the count"
      }
      ratings.push({ label: r.label.trim().slice(0, 40), reviewCount: r.reviewCount, starSum: r.starSum })
    }
  }

  let posts: SeoScoreboardPayload["posts"] = null
  if (o.posts != null) {
    const p = o.posts as Record<string, unknown>
    if (!isFiniteNumber(p.windowDays) || !Array.isArray(p.published) || !isFiniteNumber(p.draftsWaiting)) {
      return "posts needs windowDays, published[] and draftsWaiting"
    }
    const published: Array<{ label: string; count: number }> = []
    for (const row of p.published as Array<Record<string, unknown>>) {
      if (!row || typeof row.label !== "string" || !isFiniteNumber(row.count)) {
        return "each posts.published row needs label and count"
      }
      published.push({ label: row.label.trim().slice(0, 40), count: row.count })
    }
    posts = { windowDays: p.windowDays, published, draftsWaiting: p.draftsWaiting }
  }

  return { generatedAt: new Date(o.generatedAt).toISOString(), searchConsole, ratings, posts }
}

/**
 * Google shows the true mean rounded to one decimal, so the tiers sit at
 * x.x5. Work out how far each venue is from the tier below and above.
 */
export function ratingLine(r: SeoRating): SeoRatingLine {
  const mean = r.starSum / r.reviewCount
  const displayed = Math.round(mean * 10 + 1e-9) / 10
  const floor = displayed - 0.05
  const ceil = displayed + 0.05
  // n one-star reviews: (sum + n) / (count + n) < floor
  const drop = (r.starSum - floor * r.reviewCount) / (floor - 1)
  const oneStarsToDrop = Math.max(1, Math.floor(drop + 1e-9) + 1)
  // n five-star reviews: (sum + 5n) / (count + n) >= ceil
  const fiveStarsToRise =
    ceil >= 5 ? null : Math.max(1, Math.ceil((ceil * r.reviewCount - r.starSum) / (5 - ceil) - 1e-9))
  return {
    label: r.label,
    reviewCount: r.reviewCount,
    exact: Math.round(mean * 10000) / 10000,
    displayed,
    oneStarsToDrop,
    fiveStarsToRise,
  }
}

function brisbaneDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" })
}

export async function buildSeoSection(now = new Date()): Promise<SeoSection> {
  const empty: SeoSection = {
    available: false,
    pushedOn: null,
    pushAgeDays: null,
    searchConsole: null,
    ratings: [],
    posts: null,
  }
  const row = await db.appSetting.findUnique({ where: { key: SEO_SCOREBOARD_KEY } })
  if (!row) return empty
  let parsed: SeoScoreboardPayload | string
  try {
    parsed = parseSeoScoreboardPayload(JSON.parse(row.value))
  } catch {
    return empty
  }
  if (typeof parsed === "string") return empty

  const generated = new Date(parsed.generatedAt)
  const sc = parsed.searchConsole
  const changePct =
    sc && sc.previous && sc.previous.clicks3mo > 0
      ? ((sc.clicks3mo - sc.previous.clicks3mo) / sc.previous.clicks3mo) * 100
      : null

  return {
    available: true,
    pushedOn: brisbaneDate(generated),
    pushAgeDays: Math.max(0, Math.floor((now.getTime() - generated.getTime()) / 86_400_000)),
    searchConsole: sc ? { ...sc, changePct } : null,
    ratings: parsed.ratings.map(ratingLine),
    posts: parsed.posts,
  }
}
