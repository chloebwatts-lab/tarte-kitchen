export const dynamic = "force-dynamic"

import Link from "next/link"
import { Star, Quote, Mail } from "lucide-react"
import { db } from "@/lib/db"
import { SINGLE_VENUES, VENUE_LABEL, VENUE_SHORT_LABEL } from "@/lib/venues"
import { Venue, ReviewSentiment, ReviewTheme } from "@/generated/prisma/enums"
import { PendingReplyCard } from "./PendingReplyCard"

const THEME_LABEL: Record<ReviewTheme, string> = {
  FOOD_QUALITY: "Food",
  COFFEE: "Coffee",
  PASTRY: "Pastry",
  SERVICE: "Service",
  SPEED: "Speed",
  AMBIENCE: "Ambience",
  VALUE: "Value",
  CLEANLINESS: "Cleanliness",
  STAFF_PRAISE: "Staff praise",
  STAFF_COMPLAINT: "Staff complaint",
  WAIT_TIME: "Wait time",
  ALLERGEN: "Allergen",
  KIDS: "Kids",
  DIETARY: "Dietary",
  RESERVATION: "Reservation",
  OTHER: "Other",
}

const SENTIMENT_TONE: Record<ReviewSentiment, string> = {
  POSITIVE: "bg-emerald-100 text-emerald-800",
  NEGATIVE: "bg-rose-100 text-rose-800",
  MIXED: "bg-amber-100 text-amber-800",
  NEUTRAL: "bg-stone-100 text-stone-700",
}

function fmtDate(d: Date) {
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  })
}

function StarBar({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "fill-stone-200 text-stone-200"
          }`}
        />
      ))}
    </div>
  )
}

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const sp = await searchParams
  const venueParam = typeof sp.venue === "string" ? sp.venue : "ALL"
  const sentimentParam =
    typeof sp.sentiment === "string" ? sp.sentiment : "ALL"

  const venueFilter: Venue | "ALL" = (
    SINGLE_VENUES as readonly string[]
  ).includes(venueParam)
    ? (venueParam as Venue)
    : "ALL"
  const sentimentFilter: ReviewSentiment | "ALL" = (
    Object.values(ReviewSentiment) as string[]
  ).includes(sentimentParam)
    ? (sentimentParam as ReviewSentiment)
    : "ALL"

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000)
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000)

  const [places, reviews, themeRollupRaw, weeklySummary, pendingReplies] =
    await Promise.all([
    db.googleVenuePlace.findMany({
      orderBy: { venue: "asc" },
    }),
    db.googleReview.findMany({
      where: {
        ...(venueFilter !== "ALL" ? { venue: venueFilter } : {}),
        ...(sentimentFilter !== "ALL" ? { sentiment: sentimentFilter } : {}),
        publishTime: { gte: ninetyDaysAgo },
      },
      orderBy: [{ publishTime: "desc" }],
      take: 60,
    }),
    db.googleReview.findMany({
      where: {
        publishTime: { gte: ninetyDaysAgo },
        ...(venueFilter !== "ALL" ? { venue: venueFilter } : {}),
      },
      select: { venue: true, themes: true, sentiment: true },
    }),
    db.googleReviewWeeklySummary.findFirst({
      orderBy: { weekStart: "desc" },
    }),
    // Pending = DRAFTED + venue matches current filter. Show negatives
    // first (need more care), then newest first within each rating.
    db.googleReview.findMany({
      where: {
        replyStatus: "DRAFTED",
        draftReply: { not: null },
        ...(venueFilter !== "ALL" ? { venue: venueFilter } : {}),
      },
      orderBy: [{ rating: "asc" }, { publishTime: "desc" }],
      select: {
        id: true,
        venue: true,
        rating: true,
        authorName: true,
        publishTime: true,
        relativePublishTime: true,
        text: true,
        draftReply: true,
        googleReviewId: true,
      },
    }),
  ])

  // Per-venue weekly counts
  const lastWeekByVenue = new Map<Venue, { count: number; avg: number }>()
  for (const v of SINGLE_VENUES) lastWeekByVenue.set(v, { count: 0, avg: 0 })
  const last7 = await db.googleReview.findMany({
    where: { publishTime: { gte: sevenDaysAgo } },
    select: { venue: true, rating: true },
  })
  for (const v of SINGLE_VENUES) {
    const items = last7.filter((r) => r.venue === v)
    const avg = items.length
      ? items.reduce((s, r) => s + r.rating, 0) / items.length
      : 0
    lastWeekByVenue.set(v, { count: items.length, avg })
  }

  // Theme breakdown for the displayed scope
  const themeCounts = new Map<ReviewTheme, { good: number; bad: number }>()
  for (const r of themeRollupRaw) {
    for (const t of r.themes) {
      const cur = themeCounts.get(t) ?? { good: 0, bad: 0 }
      if (r.sentiment === ReviewSentiment.POSITIVE) cur.good++
      else if (
        r.sentiment === ReviewSentiment.NEGATIVE ||
        r.sentiment === ReviewSentiment.MIXED
      )
        cur.bad++
      themeCounts.set(t, cur)
    }
  }
  const sortedThemes = Array.from(themeCounts.entries())
    .map(([theme, c]) => ({ theme, ...c, total: c.good + c.bad }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-stone-900">
            Google Reviews
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Live feed across all 3 venues. New reviews are pulled and tagged
            daily; the Friday email digest summarises patterns.
          </p>
        </div>
      </header>

      {/* Pending replies — edit + approve inline */}
      {pendingReplies.length > 0 && (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-800">
              Pending replies ({pendingReplies.length})
            </h2>
            <span className="text-xs text-stone-500">
              Tweak the draft if you want, then Approve to post to Google.
            </span>
          </div>
          <div className="space-y-3">
            {pendingReplies.map((r) => (
              <PendingReplyCard
                key={r.id}
                id={r.id}
                venueLabel={VENUE_SHORT_LABEL[r.venue]}
                rating={r.rating}
                authorName={r.authorName}
                publishedLabel={r.relativePublishTime ?? fmtDate(r.publishTime)}
                text={r.text}
                initialDraft={r.draftReply ?? ""}
                isGbpFormat={r.googleReviewId.startsWith("accounts/")}
              />
            ))}
          </div>
        </section>
      )}

      {/* Venue tiles */}
      <div className="grid gap-3 sm:grid-cols-3">
        {SINGLE_VENUES.map((v) => {
          const place = places.find((p) => p.venue === v)
          const week = lastWeekByVenue.get(v)!
          const aggregate =
            place?.rating != null ? Number(place.rating) : null
          return (
            <Link
              key={v}
              href={`/reviews?venue=${v}`}
              className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-emerald-400 hover:shadow"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-stone-700">
                  {VENUE_LABEL[v].replace(/^Tarte\s+/, "")}
                </span>
                {aggregate != null && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    <span className="text-base font-semibold">
                      {aggregate.toFixed(1)}
                    </span>
                  </span>
                )}
              </div>
              <div className="text-xs text-stone-500">
                {place?.ratingCount?.toLocaleString() ?? "—"} ratings overall
              </div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-stone-500">This week</span>
                <span className="font-medium text-stone-900">
                  {week.count} review{week.count === 1 ? "" : "s"}
                  {week.count > 0 ? ` · ${week.avg.toFixed(1)}★` : ""}
                </span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* Theme rollup */}
      {sortedThemes.length > 0 && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-stone-500">
            Top themes (last 90 days{venueFilter !== "ALL" ? ` · ${VENUE_SHORT_LABEL[venueFilter]}` : ""})
          </h2>
          <ul className="space-y-2">
            {sortedThemes.map((t) => {
              const ratio = t.good + t.bad
              const goodPct = ratio ? (t.good / ratio) * 100 : 0
              return (
                <li key={t.theme} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 font-medium text-stone-800">
                    {THEME_LABEL[t.theme]}
                  </span>
                  <div className="relative flex-1 overflow-hidden rounded-full bg-rose-200">
                    <div
                      className="h-2 bg-emerald-500"
                      style={{ width: `${goodPct}%` }}
                    />
                  </div>
                  <span className="w-16 shrink-0 text-right font-mono text-xs tabular-nums text-stone-600">
                    {t.good}↑ / {t.bad}↓
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Latest weekly summary */}
      {weeklySummary && (
        <section className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-stone-700">
            <Mail className="h-4 w-4" />
            Last weekly digest
            <span className="ml-auto text-xs font-normal text-stone-400">
              week of {fmtDate(weeklySummary.weekStart)} ·{" "}
              {weeklySummary.reviewCount} review
              {weeklySummary.reviewCount === 1 ? "" : "s"}
            </span>
          </div>
          <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md bg-stone-50 p-3 text-xs leading-relaxed text-stone-700">
            {weeklySummary.body}
          </pre>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <FilterPills
          label="Venue"
          base={`/reviews?sentiment=${sentimentFilter}`}
          paramKey="venue"
          options={[
            { value: "ALL", label: "All" },
            ...SINGLE_VENUES.map((v) => ({
              value: v,
              label: VENUE_SHORT_LABEL[v],
            })),
          ]}
          active={venueFilter}
        />
        <FilterPills
          label="Sentiment"
          base={`/reviews?venue=${venueFilter}`}
          paramKey="sentiment"
          options={[
            { value: "ALL", label: "All" },
            { value: "POSITIVE", label: "Positive" },
            { value: "NEGATIVE", label: "Negative" },
            { value: "MIXED", label: "Mixed" },
          ]}
          active={sentimentFilter}
        />
      </div>

      {/* Review list */}
      {reviews.length === 0 ? (
        <div className="rounded-xl border border-dashed border-stone-300 bg-white px-5 py-10 text-center text-sm text-stone-500">
          No reviews in this view yet. The daily fetch runs at 09:00 AEST.
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <StarBar rating={r.rating} />
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-stone-600">
                  {VENUE_SHORT_LABEL[r.venue]}
                </span>
                {r.sentiment && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SENTIMENT_TONE[r.sentiment]}`}
                  >
                    {r.sentiment.toLowerCase()}
                  </span>
                )}
                {r.themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-stone-50 px-2 py-0.5 text-[11px] text-stone-600 ring-1 ring-stone-200"
                  >
                    {THEME_LABEL[t]}
                  </span>
                ))}
                <span className="ml-auto text-xs text-stone-400">
                  {r.relativePublishTime ?? fmtDate(r.publishTime)} ·{" "}
                  {r.authorName ?? "Anonymous"}
                </span>
              </div>
              {r.taggedSummary && (
                <p className="mb-1.5 text-sm font-medium text-stone-800">
                  {r.taggedSummary}
                </p>
              )}
              {r.text && (
                <p className="text-sm leading-relaxed text-stone-600">
                  <Quote className="mr-1 inline h-3 w-3 text-stone-300" />
                  {r.text.length > 360
                    ? r.text.slice(0, 360) + "…"
                    : r.text}
                </p>
              )}
              {r.staffMentions.length > 0 && (
                <p className="mt-2 text-xs text-stone-500">
                  Staff mentioned:{" "}
                  <span className="font-medium text-stone-700">
                    {r.staffMentions.join(", ")}
                  </span>
                </p>
              )}
              {r.replyText && (
                <div className="mt-3 rounded-md bg-emerald-50 p-2.5 text-xs text-emerald-900">
                  <span className="font-semibold">Owner reply:</span>{" "}
                  {r.replyText.length > 240
                    ? r.replyText.slice(0, 240) + "…"
                    : r.replyText}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterPills({
  label,
  base,
  paramKey,
  options,
  active,
}: {
  label: string
  base: string
  paramKey: string
  options: { value: string; label: string }[]
  active: string
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white px-2 py-1.5 ring-1 ring-stone-200">
      <span className="px-1.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">
        {label}
      </span>
      {options.map((o) => {
        const url = new URL("https://x" + base)
        url.searchParams.set(paramKey, o.value)
        return (
          <Link
            key={o.value}
            href={url.pathname + url.search}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold transition ${
              active === o.value
                ? "bg-stone-900 text-white"
                : "text-stone-500 hover:bg-stone-100"
            }`}
          >
            {o.label}
          </Link>
        )
      })}
    </div>
  )
}
