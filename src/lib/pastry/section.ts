/**
 * Pure rules for the pastry section's prep lists and notes. The two lists
 * are a memory aid for the team, not checklists: nothing here decides
 * "complete", it only decides what shows on a given Brisbane day.
 */

export const PREP_LISTS = [
  { key: "DAILY", title: "Daily prep" },
  { key: "AFTERNOON", title: "Afternoon prep" },
] as const

export type PrepListKey = (typeof PREP_LISTS)[number]["key"]

export function isPrepList(v: unknown): v is PrepListKey {
  return v === "DAILY" || v === "AFTERNOON"
}

/** Who the pastry notes are for. */
export const NOTES_FOR = "Jess"

/** Sorted notes stay visible this long, so the team sees it was dealt with. */
export const SORTED_NOTE_DAYS = 3

export const MAX_TASK_LENGTH = 120
export const MAX_NOTE_LENGTH = 300
export const MAX_PRODUCT_NAME_LENGTH = 60

/** Trim, collapse runs of whitespace, cap the length. "" when nothing left. */
export function cleanText(raw: string, max: number): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, max).trim()
}

/** yyyy-mm-dd of a DATE column value (stored at UTC midnight). */
export function dayString(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Is this task on the list for `day`? Every-day tasks always are; a one-off
 * only on its own day, so yesterday's extras never pile up.
 */
export function taskOnDay(task: { isActive: boolean; onlyDay: Date | null }, day: string): boolean {
  if (!task.isActive) return false
  return task.onlyDay === null || dayString(task.onlyDay) === day
}

/** Open notes always show; sorted ones for SORTED_NOTE_DAYS after. */
export function noteVisible(note: { doneAt: Date | null }, now = new Date()): boolean {
  if (!note.doneAt) return true
  return now.getTime() - note.doneAt.getTime() < SORTED_NOTE_DAYS * 86_400_000
}
