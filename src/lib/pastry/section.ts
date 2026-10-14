/**
 * Pure rules for the pastry section's prep lists and notes. The two lists
 * are a memory aid for the team, not checklists: nothing here decides
 * "complete", it only decides what shows on a given Brisbane day.
 */

export const PREP_LISTS = [
  { key: "DAILY", title: "Daily prep" },
  { key: "AFTERNOON", title: "Afternoon prep" },
  // Jess, 14 Oct 2026: the pastry room's own list.
  { key: "PASTRY_ROOM", title: "Pastry room prep list" },
] as const

export type PrepListKey = (typeof PREP_LISTS)[number]["key"]

export function isPrepList(v: unknown): v is PrepListKey {
  return PREP_LISTS.some((l) => l.key === v)
}

/** An empty record with one entry per list, for building the section. */
export function emptyLists<T>(make: () => T): Record<PrepListKey, T> {
  return Object.fromEntries(PREP_LISTS.map((l) => [l.key, make()])) as Record<PrepListKey, T>
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

// ─── Priority (Jess, 14 Oct 2026) ───────────────────────────────────────────

/** 1 = urgent, 2 = medium, 3 = not urgent. The number is what shows on the list. */
export const PRIORITIES = [1, 2, 3] as const
export type Priority = (typeof PRIORITIES)[number]
export const DEFAULT_PRIORITY: Priority = 2

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: "Urgent",
  2: "Medium",
  3: "Not urgent",
}

export function isPriority(v: unknown): v is Priority {
  return v === 1 || v === 2 || v === 3
}

/** Anything that is not exactly 1, 2 or 3 (a string "1" included) is medium. */
export function toPriority(v: unknown): Priority {
  const n = typeof v === "string" ? Number(v) : v
  return isPriority(n) ? n : DEFAULT_PRIORITY
}

/** Tapping the number walks 1, 2, 3, 1. */
export function nextPriority(p: Priority): Priority {
  return p === 1 ? 2 : p === 2 ? 3 : 1
}

/** Urgent first; inside a priority the list keeps the order jobs were added. */
export function byPriority<T extends { priority: number }>(rows: readonly T[]): T[] {
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.priority - b.r.priority || a.i - b.i)
    .map(({ r }) => r)
}

// ─── Notes under a list ─────────────────────────────────────────────────────

export const MAX_LIST_NOTE_LENGTH = 1000

/** Free text keeps its line breaks; only trailing space and the cap go. */
export function cleanNote(raw: string): string {
  return raw.replace(/\r\n?/g, "\n").replace(/[ \t]+\n/g, "\n").slice(0, MAX_LIST_NOTE_LENGTH).trimEnd()
}
