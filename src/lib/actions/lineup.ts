"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma/client"
import { valueForDate, type TarteValue } from "@/lib/lineup/tarte-ten"

// ------------------------------------------------------------------
// The daily line-up, assembled.
//
// The training system calls this "the highest-leverage 5 minutes of your
// day", and its agenda never changes: numbers, today, push item, one value,
// shout-out. Four of the five are already in this database. Somebody has
// been gathering them by hand each morning, which is why the line-up runs
// when there is time rather than every day.
//
// So the screen does the gathering. The only things a person still supplies
// are the push item and the 86s, because those are judgement.
// ------------------------------------------------------------------

/** AEST calendar day for a moment in time, as a date-only UTC midnight. */
function aestDateOnly(at: Date): Date {
  const aest = new Date(at.getTime() + 10 * 60 * 60 * 1000)
  return new Date(Date.UTC(aest.getUTCFullYear(), aest.getUTCMonth(), aest.getUTCDate()))
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + n)
  return out
}

export interface LineUpNumbers {
  date: string
  revenue: number | null
  covers: number | null
  averageSpend: number | null
}

export interface LineUpShift {
  name: string
  area: string | null
  start: string
  end: string
  /// Deputy "Open" shift: nobody assigned. Worth naming out loud at line-up,
  /// because it is a hole somebody in the room may be able to fill.
  unfilled: boolean
}

export interface LineUpShoutOut {
  staff: string
  rating: number
  authorName: string | null
  text: string | null
  publishedAt: string
}

export interface LineUpReview {
  rating: number
  authorName: string | null
  text: string | null
  publishedAt: string
}

export interface LineUp {
  venue: Venue
  date: string
  /// True on Fridays: the system says read the week's best review in full,
  /// and the worst without names.
  isFriday: boolean

  yesterday: LineUpNumbers | null
  shifts: LineUpShift[]
  pushItem: string | null
  eightySixed: string | null
  notes: string | null
  value: TarteValue
  shoutOuts: LineUpShoutOut[]
  bestReview: LineUpReview | null
  worstReview: LineUpReview | null

  ledBy: string | null
  ranAt: string | null
}

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v)

export async function getLineUp(venue: Venue, now = new Date()): Promise<LineUp> {
  const today = aestDateOnly(now)
  const yesterday = addDays(today, -1)
  const weekAgo = addDays(today, -7)
  // AEST day-of-week: getUTCDay on the shifted date is the local day.
  const isFriday = new Date(now.getTime() + 10 * 60 * 60 * 1000).getUTCDay() === 5

  const [sales, row, rosterRows, reviews] = await Promise.all([
    db.dailySalesSummary.findUnique({
      where: { date_venue: { date: yesterday, venue } },
    }),
    db.lineUp.findUnique({ where: { venue_date: { venue, date: today } } }),
    // Today's roster, from the Deputy ROSTER sync rather than timesheets —
    // timesheets only exist after the shift has happened.
    db.labourShift.findMany({
      where: {
        venue,
        source: "ROSTER",
        shiftStart: { gte: today, lt: addDays(today, 1) },
      },
      orderBy: { shiftStart: "asc" },
    }),
    db.googleReview.findMany({
      where: { venue, publishTime: { gte: weekAgo } },
      orderBy: { publishTime: "desc" },
    }),
  ])

  const shoutOuts: LineUpShoutOut[] = []
  for (const r of reviews) {
    for (const staff of r.staffMentions) {
      shoutOuts.push({
        staff,
        rating: r.rating,
        authorName: r.authorName,
        text: r.text,
        publishedAt: r.publishTime.toISOString(),
      })
    }
  }

  const toReview = (r: (typeof reviews)[number]): LineUpReview => ({
    rating: r.rating,
    authorName: r.authorName,
    text: r.text,
    publishedAt: r.publishTime.toISOString(),
  })

  // Friday only, so the rest of the week's screen stays short.
  let bestReview: LineUpReview | null = null
  let worstReview: LineUpReview | null = null
  if (isFriday && reviews.length) {
    const sorted = [...reviews].sort((a, b) => b.rating - a.rating)
    bestReview = toReview(sorted[0])
    const worst = sorted[sorted.length - 1]
    if (worst.rating <= 3 && worst.id !== sorted[0].id) worstReview = toReview(worst)
  }

  return {
    venue,
    date: today.toISOString().slice(0, 10),
    isFriday,
    yesterday: sales
      ? {
          date: sales.date.toISOString().slice(0, 10),
          revenue: num(sales.totalRevenue),
          covers: sales.totalCovers,
          averageSpend: num(sales.averageSpend),
        }
      : null,
    shifts: rosterRows.map((s) => ({
      name: s.isOpen ? "Unfilled" : s.employeeName,
      area: s.area,
      start: s.shiftStart.toISOString(),
      end: s.shiftEnd.toISOString(),
      unfilled: s.isOpen,
    })),
    pushItem: row?.pushItem ?? null,
    eightySixed: row?.eightySixed ?? null,
    notes: row?.notes ?? null,
    value: valueForDate(now),
    shoutOuts,
    bestReview,
    worstReview,
    ledBy: row?.ledBy ?? null,
    ranAt: row?.ranAt ? row.ranAt.toISOString() : null,
  }
}

export interface SaveLineUpInput {
  venue: Venue
  pushItem?: string
  eightySixed?: string
  notes?: string
}

/** The two human items. Saving is not the same as running it. */
export async function saveLineUp(input: SaveLineUpInput) {
  const date = aestDateOnly(new Date())
  const data = {
    pushItem: input.pushItem?.trim() || null,
    eightySixed: input.eightySixed?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  await db.lineUp.upsert({
    where: { venue_date: { venue: input.venue, date } },
    create: { venue: input.venue, date, ...data },
    update: data,
  })
  revalidatePath("/kitchen/lineup")
}

/**
 * Mark it as actually delivered, standing up, to the team. Separate from
 * saving the content on purpose: a prepared line-up that never ran is the
 * failure mode this records.
 */
export async function markLineUpRan(venue: Venue, ledBy: string) {
  const date = aestDateOnly(new Date())
  await db.lineUp.upsert({
    where: { venue_date: { venue, date } },
    create: { venue, date, ledBy: ledBy.trim() || null, ranAt: new Date() },
    update: { ledBy: ledBy.trim() || null, ranAt: new Date() },
  })
  revalidatePath("/kitchen/lineup")
}

/** Ran / not ran over the last N days, for the habit itself. */
export async function getLineUpStreak(venue: Venue, days = 14) {
  const today = aestDateOnly(new Date())
  const from = addDays(today, -(days - 1))
  const rows = await db.lineUp.findMany({
    where: { venue, date: { gte: from, lte: today } },
    select: { date: true, ranAt: true },
    orderBy: { date: "asc" },
  })
  const ran = new Set(
    rows.filter((r) => r.ranAt).map((r) => r.date.toISOString().slice(0, 10))
  )
  const out: { date: string; ran: boolean }[] = []
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i).toISOString().slice(0, 10)
    out.push({ date: d, ran: ran.has(d) })
  }
  return out
}
