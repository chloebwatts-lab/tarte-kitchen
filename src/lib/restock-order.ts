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
