/**
 * One-on-one notes. Pure, so the desk can count words as Oliver types and
 * the server action can refuse the same thing.
 */

export const NOTE_MIN_WORDS = 30
export const NOTE_MAX_WORDS = 60
/** Names shown before "Everyone". */
export const QUEUE_SHOWN = 12

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** Null when the note is long enough and short enough, else what to fix. */
export function noteProblem(text: string): string | null {
  const n = wordCount(text)
  if (n < NOTE_MIN_WORDS) return `Write ${NOTE_MIN_WORDS - n} more word${NOTE_MIN_WORDS - n === 1 ? "" : "s"} (${NOTE_MIN_WORDS} to ${NOTE_MAX_WORDS}).`
  if (n > NOTE_MAX_WORDS) return `Take out ${n - NOTE_MAX_WORDS} word${n - NOTE_MAX_WORDS === 1 ? "" : "s"} (${NOTE_MIN_WORDS} to ${NOTE_MAX_WORDS}).`
  return null
}

export interface TalkNote {
  name: string
  note: string
}

/** This week's talks that carry a note, in the order they were logged. */
export function talkNotesOf(rows: { staffName: string; note: string | null }[]): TalkNote[] {
  return rows.filter((r) => r.note && r.note.trim()).map((r) => ({ name: r.staffName, note: r.note!.trim() }))
}
