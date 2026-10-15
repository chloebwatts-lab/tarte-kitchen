import { sectionRank } from "@/lib/stations"

/**
 * Order of the prep list. Sections stay in the chefs' own order (Jose's
 * and Vini's sheets). Inside a section the list starts in paper-sheet
 * order, and once there is enough history the prep that gets asked for
 * most floats to the top (Chloe, 5 Oct 2026), so the everyday items are
 * the first thing a closing chef sees. Ties keep the paper order.
 */
export const LEARN_WINDOW_DAYS = 28
/** Nights of lists in the window before the learned order takes over. */
export const LEARN_MIN_NIGHTS = 10

export interface OrderableItem {
  id: string
  name: string
  category: string
  sortOrder: number
}

export function orderPrepItems<T extends OrderableItem>(
  items: T[],
  requestCounts: Map<string, number>,
  nightsOfHistory: number
): T[] {
  const learned = nightsOfHistory >= LEARN_MIN_NIGHTS
  return [...items].sort(
    (a, b) =>
      sectionRank(a.category) - sectionRank(b.category) ||
      a.category.localeCompare(b.category) ||
      (learned ? (requestCounts.get(b.id) ?? 0) - (requestCounts.get(a.id) ?? 0) : 0) ||
      a.sortOrder - b.sortOrder ||
      a.name.localeCompare(b.name)
  )
}

/**
 * True for a line that a finished run already delivered. Today's sheet can
 * be closed by the morning run and then opened again for tonight's list;
 * what the morning made must not come back as work on the next run.
 */
export function doneInEarlierRun(suppliedAt: Date | null, sheetRestockedAt: Date | null): boolean {
  return !!suppliedAt && !!sheetRestockedAt && suppliedAt.getTime() <= sheetRestockedAt.getTime()
}

// ─── Priority numbers (Jose, 15 Oct 2026) ───────────────────────────

/**
 * The next priority number for a tap, given the numbers already taken in
 * the same sequence. Each section numbers its own prep from 1 (Café's
 * burger buns are Café's 1, not the house's 18), so the caller passes the
 * ranks of that section only. Gaps do not matter, order does.
 */
export function nextPriorityRank(taken: Iterable<number | null | undefined>): number {
  let max = 0
  for (const r of taken) if (r != null && r > max) max = r
  return max + 1
}

/** The sequence a line's priority number belongs to. */
export function rankSequence(sectioned: boolean, category: string): string {
  return sectioned ? category : "ALL"
}

// ─── Morning run order ─────────────────────────────────────────────

export interface RunOrderable {
  category: string
  priority: boolean
  priorityRank: number | null
  neededBy: string | null
  name: string
}

/**
 * Order of the Make prep list. Priorities first. On a sectioned list the
 * numbers restart per section, so the priorities run section by section
 * (Restaurant 1, 2, 3, then Café 1, 2, 3) rather than 1, 1, 2, 2; a
 * deadline still lifts an item to the top of its section. On a plain list
 * the numbers are one sequence and the earliest deadline leads.
 */
export function compareRunItems(sectioned: boolean): (a: RunOrderable, b: RunOrderable) => number {
  return (a, b) =>
    Number(b.priority) - Number(a.priority) ||
    (sectioned && a.priority ? sectionRank(a.category) - sectionRank(b.category) || a.category.localeCompare(b.category) : 0) ||
    // Anything with a deadline comes first, earliest deadline on top
    (a.neededBy ?? "9").localeCompare(b.neededBy ?? "9") ||
    // Within priority items: Jose's rank order, unranked stars last
    (a.priorityRank ?? 99) - (b.priorityRank ?? 99) ||
    sectionRank(a.category) - sectionRank(b.category) ||
    a.category.localeCompare(b.category) ||
    a.name.localeCompare(b.name)
}

// ─── Carry-over (Jose, 15 Oct 2026) ─────────────────────────────────

/**
 * How much of a request is still to make: the amount asked for less what
 * was delivered. Zero for nothing requested or a full (or over) delivery.
 */
export function outstandingQty(requested: number | null, supplied: number | null): number {
  const r = requested ?? 0
  if (r <= 0) return 0
  return Math.max(0, Math.round((r - (supplied ?? 0)) * 100) / 100)
}

/**
 * True for a line an earlier night asked for that still wants making and
 * has not been dealt with: not fully delivered, not already brought onto a
 * later list, not marked not needed.
 */
export function isCarryoverLine(line: {
  requested: number | null
  supplied: number | null
  carriedAt: Date | null
  droppedAt: Date | null
}): boolean {
  if (line.carriedAt || line.droppedAt) return false
  return outstandingQty(line.requested, line.supplied) > 0
}

/**
 * The request to write on today's sheet when an old line is brought in.
 * A line today already asks for grows by the outstanding amount; a line a
 * finished run already delivered (reopened sheet) starts again from the
 * outstanding amount, as a fresh request.
 */
export function carriedRequest(
  outstanding: number,
  today: { requested: number | null; doneEarlier: boolean } | null
): number {
  if (!today || today.doneEarlier) return outstanding
  return Math.round(((today.requested ?? 0) + outstanding) * 100) / 100
}
