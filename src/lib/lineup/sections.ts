import type { LineUpShift } from "@/lib/actions/lineup"

/**
 * How the "Today" section of the line-up is read out: front to back, and
 * within each section the first starter first.
 *
 * Deputy's salary "cards" are rostered as if they were people ("Salary Chefs
 * Burleigh 9–10am") so payroll can allocate. At line-up they are noise, so
 * they are dropped; a real person rostered onto a salary area is re-homed to
 * the section the area name implies.
 */
export const SALARY_PLACEHOLDER = /^salary\b/i
const VENUE_WORDS = /\b(burleigh|currumbin|beach house|tea garden|bakery)\b/gi

export function sectionOf(area: string | null): string {
  if (!area) return "Unassigned"
  let a = area.replace(SALARY_PLACEHOLDER, "").replace(VENUE_WORDS, "").replace(/\s+/g, " ").trim()
  if (!a) return "Unassigned"
  if (/^boh$/i.test(a)) a = "Kitchen"
  if (/^foh$/i.test(a)) a = "FOH"
  if (/^kp/i.test(a)) a = "KP"
  return a.charAt(0).toUpperCase() + a.slice(1)
}

/** Read out front to back: floor first, then the kitchen, then the pastry team. */
export const SECTION_ORDER = ["FOH", "Barista", "Takeaway area", "Juice bar", "Kitchen", "Prep", "Pastry", "KP"]

export function sectionRank(name: string): number {
  const i = SECTION_ORDER.findIndex((s) => s.toLowerCase() === name.toLowerCase())
  return i === -1 ? SECTION_ORDER.length : i
}

/**
 * Within a section: earliest start first. Same start, the longer shift
 * first (it is the one that anchors the day), then by name so the order
 * is stable between renders.
 */
export function compareShifts(a: LineUpShift, b: LineUpShift): number {
  const start = Date.parse(a.start) - Date.parse(b.start)
  if (start !== 0) return start
  const end = Date.parse(b.end) - Date.parse(a.end)
  if (end !== 0) return end
  return a.name.localeCompare(b.name)
}

export type Section = [name: string, shifts: LineUpShift[]]

/** Salary placeholders dropped, grouped by section, sections and shifts in reading order. */
export function groupShifts(all: LineUpShift[]): Section[] {
  const shifts = all.filter((s) => s.unfilled || !SALARY_PLACEHOLDER.test(s.name.trim()))
  const byArea = new Map<string, LineUpShift[]>()
  for (const s of shifts) {
    const key = sectionOf(s.area)
    const list = byArea.get(key) ?? []
    list.push(s)
    byArea.set(key, list)
  }
  const sections: Section[] = [...byArea.entries()].sort(
    ([a], [b]) => sectionRank(a) - sectionRank(b) || a.localeCompare(b)
  )
  for (const [, list] of sections) list.sort(compareShifts)
  return sections
}
