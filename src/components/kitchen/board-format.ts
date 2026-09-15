import type { VenueTaskPriority } from "@/generated/prisma/client"

/**
 * Words and formatting shared by the three faces of one list: the Morning
 * board (manager allocates), the Jobs board (owners tick off) and the plate
 * (other managers read). Pure functions only, so server and client
 * components can both import them; the components live in board-bits.tsx.
 */

export const CATEGORY: Record<string, string> = {
  BROKEN_EQUIPMENT: "Broken equipment",
  LOW_STOCK: "Low stock",
  RUBBISH_REMOVAL: "Rubbish",
  CLEANING: "Cleaning",
  FURNITURE: "Furniture",
  BUILDING: "Building",
  MISC: "Other",
}

/** Same words the reporter chose from on the Spotted something screen. */
export const PRIORITY_LABEL: Record<VenueTaskPriority, string> = {
  URGENT: "Today",
  NORMAL: "This week",
  WHENEVER: "Whenever",
}

/** The sizes a manager can put on a job. Rough on purpose. */
export const ESTIMATES: { minutes: number; label: string }[] = [
  { minutes: 15, label: "15 min" },
  { minutes: 30, label: "30 min" },
  { minutes: 60, label: "1 hr" },
  { minutes: 120, label: "2 hrs" },
  { minutes: 240, label: "Half a day" },
  { minutes: 480, label: "A day" },
]

export function fmtMinutes(m: number): string {
  const hit = ESTIMATES.find((e) => e.minutes === m)
  if (hit) return hit.label.toLowerCase()
  if (m < 60) return `${m} min`
  const h = m / 60
  return `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`
}

/** A total, for the plate: hours, and days once it is more than one. */
export function fmtHours(m: number): string {
  if (m <= 0) return "0 hrs"
  if (m < 60) return `${m} min`
  const h = m / 60
  const hrs = `${Number.isInteger(h) ? h : h.toFixed(1)} hr${h === 1 ? "" : "s"}`
  if (m >= 480) {
    const d = m / 480
    return `${hrs} (about ${Number.isInteger(d) ? d : d.toFixed(1)} day${d === 1 ? "" : "s"})`
  }
  return hrs
}

const dayFmt = new Intl.DateTimeFormat("en-AU", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Australia/Brisbane",
})

const todayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" })

/** dueAt arrives as an ISO string for a @db.Date column: the calendar day is the first ten chars. */
export function dueLabel(dueAt: string): { text: string; late: boolean } {
  const day = dueAt.slice(0, 10)
  const today = todayFmt.format(new Date())
  const date = new Date(`${day}T12:00:00+10:00`)
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (diff === 0) return { text: "due today", late: false }
  if (diff === 1) return { text: "due tomorrow", late: false }
  if (diff < 0) {
    const d = -diff
    return { text: `${d} day${d === 1 ? "" : "s"} overdue`, late: true }
  }
  return { text: `due ${dayFmt.format(date)}`, late: false }
}

export function ageLabel(days: number): string {
  if (days <= 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 14) return `${days} days ago`
  const w = Math.floor(days / 7)
  return `${w} week${w === 1 ? "" : "s"} ago`
}

/** A timestamp as a person would say it: today, yesterday, or the day. */
export function whenLabel(iso: string): string {
  const day = todayFmt.format(new Date(iso))
  const today = todayFmt.format(new Date())
  const diff = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / 86_400_000)
  if (diff === 0) return "today"
  if (diff === 1) return "yesterday"
  return dayFmt.format(new Date(iso))
}

export const chip = (active: boolean) =>
  `rounded-[10px] px-3 py-2 text-[15px] font-semibold transition active:scale-[0.98] disabled:opacity-50 ${
    active
      ? "bg-[var(--tk-charcoal)] text-white"
      : "border-[1.5px] border-[var(--tk-line)] bg-[var(--tk-card)] text-[var(--tk-charcoal)]"
  }`
