/**
 * Pure helpers for the Said + Done commitments module. Safe to import
 * from both server actions and client components, no db, no env.
 *
 * All dates travel as YYYY-MM-DD strings (AEST calendar dates), same as
 * the checklist module's convention for `@db.Date` columns.
 */

export type OneOffStatus = "open" | "done" | "overdue"

export const COMMITMENT_PARTY_LABEL: Record<string, string> = {
  JOSE: "Jose",
  CHLOE: "Chloe",
  CANDY: "Candy",
}

export const PHOTO_KINDS = [
  { value: "weekly-update", label: "Weekly update" },
  { value: "issue-solution", label: "Issue + solution" },
  { value: "fault-report", label: "Fault report" },
  { value: "other", label: "Other" },
] as const

export function photoKindLabel(kind: string): string {
  return PHOTO_KINDS.find((k) => k.value === kind)?.label ?? "Other"
}

/** Effective due date, the renegotiated date wins once one is agreed. */
export function effectiveDueOn(c: {
  dueOn: string
  newDueOn: string | null
}): string {
  return c.newDueOn ?? c.dueOn
}

/**
 * Derived status per the paper sheet's rule: done when a done date is
 * recorded; overdue when the (effective) due date has passed without
 * one; open otherwise. The due day itself still counts as open.
 */
export function oneOffStatus(
  c: { dueOn: string; newDueOn: string | null; doneOn: string | null },
  todayYmd: string
): OneOffStatus {
  if (c.doneOn) return "done"
  return todayYmd > effectiveDueOn(c) ? "overdue" : "open"
}

/** "Mon 27 Jul" style label for a week-start date. */
export function weekLabel(weekStartYmd: string): string {
  const d = new Date(`${weekStartYmd}T00:00:00`)
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

/** "27 Jul – 2 Aug" range label for a Monday-anchored week. */
export function weekRangeLabel(weekStartYmd: string): string {
  const s = new Date(`${weekStartYmd}T00:00:00`)
  const e = new Date(s)
  e.setDate(e.getDate() + 6)
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })
  return `${fmt(s)} – ${fmt(e)}`
}

export function formatDayMonth(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  })
}
