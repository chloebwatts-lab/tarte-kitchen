/**
 * Auto-fill sources for standing commitments. Each returns what the app
 * can derive for a Mon–Sun week so Chloe doesn't have to hand-tick
 * things the system already knows. A manual mark always overrides.
 */

import { db } from "@/lib/db"
import { Venue, ChecklistCadence } from "@/generated/prisma/client"
import { addDays, todayAest, ymd } from "./weeks"

export interface AutoMark {
  /// true/false = derived Y/N; null = can't be derived (week still in
  /// flight, or nothing configured to measure).
  met: boolean | null
  /// Short human summary shown as the cell tooltip / note.
  detail: string | null
}

const ALL_VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]

function venuesFor(v: Venue): Venue[] {
  return v === "BOTH" ? ALL_VENUES : [v]
}

/**
 * "Daily + weekly checklists done in the app" for one Mon-anchored week.
 *
 * Expected work is derived from the currently active templates (runs are
 * lazily created, so a checklist nobody opened has no run row at all):
 *   - DAILY: one completed run per template-venue per elapsed day
 *   - WEEKLY: one completed run per template-venue, anchored to Monday
 *
 * The week only earns a Y/N once it has fully elapsed — for the
 * in-flight week we return met=null with a progress detail. Historical
 * weeks are measured against today's template set, which is the best
 * available approximation.
 */
export async function checklistWeekAuto(weekStart: string): Promise<AutoMark> {
  const monday = new Date(weekStart)
  const sunday = addDays(monday, 6)
  const today = todayAest()

  if (monday > today) return { met: null, detail: null }

  const templates = await db.checklistTemplate.findMany({
    where: {
      isActive: true,
      cadence: { in: ["DAILY", "WEEKLY"] as ChecklistCadence[] },
    },
    select: { id: true, venue: true, cadence: true },
  })

  // Days of the week that have fully elapsed (an in-progress day can't
  // have "missed" its checklists yet).
  const elapsedDays: Date[] = []
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i)
    if (day < today) elapsedDays.push(day)
  }

  const daily = templates.filter((t) => t.cadence === "DAILY")
  const weekly = templates.filter((t) => t.cadence === "WEEKLY")

  const expectedDaily = daily.reduce(
    (sum, t) => sum + venuesFor(t.venue).length * elapsedDays.length,
    0
  )
  const expectedWeekly = weekly.reduce(
    (sum, t) => sum + venuesFor(t.venue).length,
    0
  )
  if (expectedDaily + expectedWeekly === 0) {
    return { met: null, detail: "No active checklists to measure" }
  }

  const completedRuns = await db.checklistRun.findMany({
    where: {
      status: "COMPLETED",
      runDate: { gte: monday, lte: sunday },
      templateId: { in: templates.map((t) => t.id) },
    },
    select: { templateId: true, venue: true, runDate: true },
  })

  // Count each (template, venue, date) slot at most once — the run
  // unique key also includes shift, so double-shift runs shouldn't
  // inflate the numerator.
  const done = new Set(
    completedRuns.map((r) => `${r.templateId}|${r.venue}|${ymd(r.runDate)}`)
  )
  let completedDaily = 0
  for (const t of daily) {
    for (const v of venuesFor(t.venue)) {
      for (const day of elapsedDays) {
        if (done.has(`${t.id}|${v}|${ymd(day)}`)) completedDaily++
      }
    }
  }
  let completedWeekly = 0
  for (const t of weekly) {
    for (const v of venuesFor(t.venue)) {
      if (done.has(`${t.id}|${v}|${weekStart}`)) completedWeekly++
    }
  }

  const detail = `${completedDaily}/${expectedDaily} daily · ${completedWeekly}/${expectedWeekly} weekly`
  const weekFullyElapsed = sunday < today
  if (!weekFullyElapsed) return { met: null, detail: `So far: ${detail}` }

  return {
    met: completedDaily >= expectedDaily && completedWeekly >= expectedWeekly,
    detail,
  }
}

/**
 * "Roster posted 3 weeks ahead" — hook for the Tarte Shifts app
 * (~/C/tarte-shifts). Once Shifts is deployed, this should ask it how
 * far ahead published rosters extend as of this week (its rosters are
 * Wed–Tue, keyed by venue) and return met = horizon >= 3 weeks.
 * Until then the commitment is ticked manually.
 */
export async function rosterHorizonAuto(): Promise<AutoMark> {
  return { met: null, detail: null }
}

/** Dispatch table — keyed by StandingCommitment.autoSource. */
export const AUTO_SOURCES: Record<
  string,
  (weekStart: string) => Promise<AutoMark>
> = {
  checklists: checklistWeekAuto,
  "shifts-roster": rosterHorizonAuto,
}
