/**
 * Commitments data for the Friday digest: overdue one-off promises plus
 * any standing commitment that's been marked N for 2+ consecutive
 * completed weeks (manual mark wins, else the auto-derived value).
 */

import { db } from "@/lib/db"
import { AUTO_SOURCES } from "./auto"
import { addDays, lastCompletedWeekStart, todayAest, ymd, COMMITMENTS_EPOCH } from "./weeks"
import { effectiveDueOn, oneOffStatus } from "./shared"

export interface CommitmentsSection {
  overdueOneOffs: Array<{
    promise: string
    saidBy: string
    agreedOn: string
    effectiveDueOn: string
    wasRescheduled: boolean
    missedReason: string | null
    daysOverdue: number
  }>
  standingConcerns: Array<{
    title: string
    consecutiveMissedWeeks: number
    lastNote: string | null
  }>
  openCount: number
  doneLast7Days: number
}

const STREAK_LOOKBACK_WEEKS = 8

export async function buildCommitmentsSection(): Promise<CommitmentsSection> {
  const today = todayAest()
  const todayKey = ymd(today)

  const [oneOffs, standing] = await Promise.all([
    db.oneOffCommitment.findMany(),
    db.standingCommitment.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      include: {
        marks: {
          where: {
            weekStart: {
              gte: addDays(new Date(lastCompletedWeekStart()), -7 * STREAK_LOOKBACK_WEEKS),
            },
          },
        },
      },
    }),
  ])

  const withStatus = oneOffs.map((o) => {
    const serial = {
      dueOn: ymd(o.dueOn),
      newDueOn: o.newDueOn ? ymd(o.newDueOn) : null,
      doneOn: o.doneOn ? ymd(o.doneOn) : null,
    }
    return { o, serial, status: oneOffStatus(serial, todayKey) }
  })

  const overdueOneOffs = withStatus
    .filter((x) => x.status === "overdue")
    .map(({ o, serial }) => {
      const due = effectiveDueOn(serial)
      const daysOverdue = Math.round(
        (today.getTime() - new Date(due).getTime()) / 86400000
      )
      return {
        promise: o.promise,
        saidBy: o.saidBy as string,
        agreedOn: ymd(o.agreedOn),
        effectiveDueOn: due,
        wasRescheduled: o.newDueOn !== null,
        missedReason: o.missedReason,
        daysOverdue,
      }
    })
    .sort((a, b) => b.daysOverdue - a.daysOverdue)

  // Walk back from the last fully completed Mon–Sun week counting
  // consecutive misses. An unmarked (and underivable) week breaks the
  // streak — only explicit Ns count.
  const standingConcerns: CommitmentsSection["standingConcerns"] = []
  for (const c of standing) {
    let streak = 0
    let lastNote: string | null = null
    let cursor = lastCompletedWeekStart()
    for (let i = 0; i < STREAK_LOOKBACK_WEEKS; i++) {
      if (cursor < COMMITMENTS_EPOCH) break
      const manual = c.marks.find((m) => ymd(m.weekStart) === cursor)
      let met: boolean | null
      let note: string | null
      if (manual) {
        met = manual.met
        note = manual.note
      } else {
        const auto = c.autoSource ? AUTO_SOURCES[c.autoSource] : undefined
        const derived = auto ? await auto(cursor) : null
        met = derived?.met ?? null
        note = derived?.detail ?? null
      }
      if (met !== false) break
      streak++
      if (lastNote === null) lastNote = note
      cursor = ymd(addDays(new Date(cursor), -7))
    }
    if (streak >= 2) {
      standingConcerns.push({
        title: c.title,
        consecutiveMissedWeeks: streak,
        lastNote,
      })
    }
  }

  const sevenDaysAgo = addDays(today, -7)
  return {
    overdueOneOffs,
    standingConcerns,
    openCount: withStatus.filter((x) => x.status === "open").length,
    doneLast7Days: withStatus.filter(
      (x) => x.o.doneOn && x.o.doneOn >= sevenDaysAgo
    ).length,
  }
}
