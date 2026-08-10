/**
 * Service calendar domain constants.
 *
 * Categories are the recurring trade services a food venue runs on a
 * cycle, distinct from the maintenance module: maintenance is "something
 * broke", services are "the truck comes every quarter whether or not
 * anything broke". Default cadences are starting points (roughly the
 * usual QLD compliance rhythm); the real cadence per venue is editable
 * on the admin /services page.
 */

export interface ServiceCategoryDef {
  key: string
  label: string
  /** Short kiosk-friendly explanation of what this service is. */
  blurb: string
  /** Starting cadence in days when a program is auto-created. */
  defaultIntervalDays: number | null
  /** Seed this category for new venues by default. */
  seed: boolean
}

export const SERVICE_CATEGORIES: ServiceCategoryDef[] = [
  {
    key: "grease-trap",
    label: "Grease trap pump-out",
    blurb: "Waste truck pumps out the trap. Council checks these records.",
    defaultIntervalDays: 91,
    seed: true,
  },
  {
    key: "pest-control",
    label: "Pest control",
    blurb: "Regular treatment visit. Report goes in the council folder.",
    defaultIntervalDays: 90,
    seed: true,
  },
  {
    key: "exhaust-clean",
    label: "Canopy & flue clean",
    blurb: "Full degrease of the exhaust canopy, flue and fan. Fire-risk item.",
    defaultIntervalDays: 182,
    seed: true,
  },
  {
    key: "hood-filters",
    label: "Canopy filter exchange",
    blurb: "Filter swap service for the canopy filters.",
    defaultIntervalDays: 28,
    seed: true,
  },
  {
    key: "fire-safety",
    label: "Fire equipment inspection",
    blurb: "Extinguishers, blankets and exit lights tested and tagged.",
    defaultIntervalDays: 182,
    seed: true,
  },
  {
    key: "deep-clean",
    label: "Kitchen deep clean",
    blurb: "Contracted deep clean beyond the daily checklists.",
    defaultIntervalDays: 91,
    seed: true,
  },
  {
    key: "test-and-tag",
    label: "Electrical test & tag",
    blurb: "Portable appliances tested and tagged.",
    defaultIntervalDays: 365,
    seed: true,
  },
  {
    key: "backflow",
    label: "Backflow valve test",
    blurb: "Annual test of the backflow prevention device on the water supply.",
    defaultIntervalDays: 365,
    seed: true,
  },
  {
    key: "coffee-machine",
    label: "Coffee machine service",
    blurb: "Scheduled service of machine and grinders (not breakdowns).",
    defaultIntervalDays: 182,
    seed: true,
  },
  {
    key: "gas-safety",
    label: "Gas safety check",
    blurb: "Licensed gas fitter checks appliances and lines. Insurers ask for this.",
    defaultIntervalDays: 365,
    seed: false,
  },
  {
    key: "evacuation-drill",
    label: "Fire evacuation drill",
    blurb: "Annual evacuation practice + staff instructions (QFES requirement).",
    defaultIntervalDays: 365,
    seed: false,
  },
  {
    key: "air-con",
    label: "Air-con service",
    blurb: "Filter clean and service of air-conditioning units.",
    defaultIntervalDays: 182,
    seed: false,
  },
  {
    key: "first-aid",
    label: "First aid kit restock",
    blurb: "Kit check and restock visit.",
    defaultIntervalDays: 182,
    seed: false,
  },
  {
    key: "other",
    label: "Other",
    blurb: "Anything else on a cycle, name it on the program.",
    defaultIntervalDays: null,
    seed: false,
  },
]

export const SERVICE_CATEGORY_BY_KEY: Record<string, ServiceCategoryDef> =
  Object.fromEntries(SERVICE_CATEGORIES.map((c) => [c.key, c]))

export function serviceCategoryLabel(category: string, label?: string | null): string {
  if (label?.trim()) return label.trim()
  return SERVICE_CATEGORY_BY_KEY[category]?.label ?? category
}

/** Gmail full-text probes for the generic (unknown-sender) sweep. */
export const SERVICE_SEARCH_PHRASES = [
  '"grease trap"',
  '"grease arrestor"',
  '"pump out"',
  '"pump-out"',
  '"pest control"',
  '"pest treatment"',
  '"deep clean"',
  '"exhaust clean"',
  '"canopy clean"',
  '"flue clean"',
  '"kitchen exhaust"',
  '"fire inspection"',
  '"fire safety"',
  '"fire equipment"',
  '"test and tag"',
  '"backflow"',
  '"filter exchange"',
  '"liquid waste"',
]

// ── Status maths ────────────────────────────────────────────────────────────

export type ServiceStatusKey = "OVERDUE" | "DUE_SOON" | "BOOKED" | "OK" | "NO_RECORD"

export interface ProgramSchedule {
  lastDone: Date | null
  /** Earliest booking today or later. */
  nextBooked: Date | null
  /** Booking if one exists, else lastDone + interval. */
  nextDue: Date | null
  status: ServiceStatusKey
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

/**
 * Derives the calendar line for one program from its visits.
 * "Due soon" opens at a quarter of the cycle (capped at 14 days) before
 * the due date, so a 28-day filter swap warns a week out, not two.
 */
export function computeSchedule(
  program: { intervalDays: number | null },
  visits: Array<{ kind: "COMPLETED" | "BOOKED"; serviceDate: Date }>,
  now: Date = new Date()
): ProgramSchedule {
  const today = startOfDay(now)

  let lastDone: Date | null = null
  let nextBooked: Date | null = null
  for (const v of visits) {
    const d = startOfDay(v.serviceDate)
    if (v.kind === "COMPLETED") {
      if (!lastDone || d > lastDone) lastDone = d
    } else if (d >= today) {
      if (!nextBooked || d < nextBooked) nextBooked = d
    }
  }

  if (nextBooked) {
    return { lastDone, nextBooked, nextDue: nextBooked, status: "BOOKED" }
  }

  if (!lastDone) {
    return { lastDone: null, nextBooked: null, nextDue: null, status: "NO_RECORD" }
  }

  if (!program.intervalDays) {
    return { lastDone, nextBooked: null, nextDue: null, status: "OK" }
  }

  const nextDue = addDays(lastDone, program.intervalDays)
  const soonWindow = Math.min(14, Math.max(2, Math.round(program.intervalDays / 4)))
  const status: ServiceStatusKey =
    nextDue < today ? "OVERDUE" : nextDue <= addDays(today, soonWindow) ? "DUE_SOON" : "OK"
  return { lastDone, nextBooked: null, nextDue, status }
}

export const STATUS_LABEL: Record<ServiceStatusKey, string> = {
  OVERDUE: "Overdue",
  DUE_SOON: "Due soon",
  BOOKED: "Booked",
  OK: "On track",
  NO_RECORD: "No record yet",
}
