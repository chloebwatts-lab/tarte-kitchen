/**
 * One-on-one notes. Pure, so the desk can count words as Oliver types.
 */

/** Words to aim for. A target, not a limit: shorter or longer still saves. */
export const NOTE_TARGET_WORDS = 30
/** Names shown before "Everyone". */
export const QUEUE_SHOWN = 12

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

/** The line under the note box, e.g. "12 words. 18 to go to 30." */
export function noteCounter(text: string): { line: string; reached: boolean } {
  const n = wordCount(text)
  const words = `${n} ${n === 1 ? "word" : "words"}.`
  if (n >= NOTE_TARGET_WORDS) return { line: `${words} Target reached.`, reached: true }
  return { line: `${words} ${NOTE_TARGET_WORDS - n} to go to ${NOTE_TARGET_WORDS}.`, reached: false }
}

export interface TalkNote {
  name: string
  note: string
}

/** This week's talks that carry a note, in the order they were logged. */
export function talkNotesOf(rows: { staffName: string; note: string | null }[]): TalkNote[] {
  return rows.filter((r) => r.note && r.note.trim()).map((r) => ({ name: r.staffName, note: r.note!.trim() }))
}
