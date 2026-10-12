/**
 * Audit of Oliver's week for the Monday report. A tick on the desk is his
 * word; the app's own readings are the evidence. This puts the two side by
 * side so Chloe can see which ticks the app confirms, which it disputes,
 * which rest on his word alone, and whether the reason he gave for a miss
 * holds up (for example "rosters got in the way" while the roster itself
 * never went live). Pure: no database, so it is unit tested.
 */

import type { BoardItem } from "./board"

export interface AuditLine {
  slug: string
  title: string
  /** The reading or the reason, one or two lines, already plain text. */
  detail: string
}

export interface ReasonLine extends AuditLine {
  /** What Oliver wrote, or "" when he saved a Couldn't with no reason. */
  reason: string
  /** Set when the reason blames something the app can see did not get done either. */
  holdsUp: boolean
  /** Why the reason does not hold up, when it does not. */
  why?: string
}

export interface GmAudit {
  /** Ticked done, and the app's reading agrees (or the app ticked it itself). */
  confirmed: AuditLine[]
  /** Ticked done, but the app's reading says it was not. */
  disputed: AuditLine[]
  /** Ticked done, and the app has no way to check (walks, portions, chats). */
  onHisWord: AuditLine[]
  /** Marked Couldn't, with the reason and whether it holds up. */
  reasons: ReasonLine[]
  /** Not done and nothing written: never ticked, or the app marked it not met and he left it. */
  noReason: AuditLine[]
  /** Weeks in a row an item has not been done, counting this week. Only items not done this week, 2 or more. */
  repeats: { slug: string; title: string; weeks: number }[]
}

export type MissStreaks = Record<string, number>

const isDone = (i: BoardItem) => i.state === "done" || i.state === "auto-ok"

/** Notes that pin the miss on the roster or rostering. */
export const BLAMES_ROSTER = /\broster/i

/**
 * `priorMisses` is, per slug, how many consecutive weeks before this one the
 * item was not done (see missStreakFromHistory). The report item itself is
 * left out: whether the report went is the email's own headline.
 */
export function auditGmWeek(items: BoardItem[], priorMisses: MissStreaks = {}): GmAudit {
  const out: GmAudit = { confirmed: [], disputed: [], onHisWord: [], reasons: [], noReason: [], repeats: [] }
  const roster = items.find((i) => i.slug === "roster-2wk")
  const rosterNotLive = roster ? !isDone(roster) : false

  for (const i of items) {
    if (i.slug === "weekly-report") continue
    const reading = i.auto_?.detail ?? ""

    if (i.state === "auto-ok") {
      out.confirmed.push({ slug: i.slug, title: i.title, detail: reading })
      continue
    }
    if (i.state === "done") {
      if (!i.auto_ || i.auto_.met === null) {
        out.onHisWord.push({ slug: i.slug, title: i.title, detail: i.note ?? "" })
      } else if (i.auto_.met === false) {
        out.disputed.push({ slug: i.slug, title: i.title, detail: `Ticked done. The app sees: ${reading}` })
      } else {
        out.confirmed.push({ slug: i.slug, title: i.title, detail: reading })
      }
      continue
    }

    // Not done this week, one way or another.
    const weeks = (priorMisses[i.slug] ?? 0) + 1
    if (weeks >= 2) out.repeats.push({ slug: i.slug, title: i.title, weeks })

    if (i.state === "couldnt") {
      const reason = (i.note ?? "").trim()
      let holdsUp = true
      let why: string | undefined
      if (!reason) {
        holdsUp = false
        why = "No reason written."
      } else if (BLAMES_ROSTER.test(reason) && i.slug !== "roster-2wk" && rosterNotLive) {
        holdsUp = false
        why = `Blames the roster, but the roster did not get done either${roster?.auto_?.detail ? `: ${roster.auto_.detail}` : "."}`
      }
      out.reasons.push({ slug: i.slug, title: i.title, reason, detail: reason || "No reason written.", holdsUp, why })
      continue
    }

    // open or auto-bad with no mark from Oliver.
    out.noReason.push({
      slug: i.slug,
      title: i.title,
      detail: i.state === "auto-bad" ? `The app sees: ${reading}` : "Never ticked, nothing written.",
    })
  }
  return out
}

/**
 * Consecutive prior weeks each item went undone, walking back from last
 * week. A week with no marks at all (the desk was not in use) ends every
 * streak, so the count never reaches back before the desk existed. A
 * missing mark in a week that has marks counts as not done: that is how
 * the tracking page counts it too.
 *
 * `history` is most recent week first, each with that week's marks.
 */
export function missStreakFromHistory(
  slugs: string[],
  history: { marks: { itemSlug: string; met: boolean }[] }[]
): MissStreaks {
  const out: MissStreaks = {}
  const alive = new Set(slugs)
  for (const week of history) {
    if (alive.size === 0) break
    if (week.marks.length === 0) break
    const met = new Set(week.marks.filter((m) => m.met).map((m) => m.itemSlug))
    for (const slug of [...alive]) {
      if (met.has(slug)) alive.delete(slug)
      else out[slug] = (out[slug] ?? 0) + 1
    }
  }
  return out
}

/** One line for the headline tile and the preheader. */
export function auditSummary(a: GmAudit): string {
  const bits: string[] = []
  if (a.disputed.length) bits.push(`${a.disputed.length} tick${a.disputed.length === 1 ? "" : "s"} disputed`)
  const shaky = a.reasons.filter((r) => !r.holdsUp).length
  if (shaky) bits.push(`${shaky} reason${shaky === 1 ? "" : "s"} do${shaky === 1 ? "es" : ""} not hold up`)
  if (a.noReason.length) bits.push(`${a.noReason.length} with no reason`)
  if (a.repeats.length) bits.push(`${a.repeats.length} not done 2+ weeks running`)
  return bits.join(", ")
}
