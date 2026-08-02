"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue, ChecklistCadence } from "@/generated/prisma/client"

export interface OverdueRun {
  alertId: string | null
  templateId: string
  templateName: string
  area: string | null
  venue: Venue
  runDate: string
  dueByHour: number
  completedItems: number
  totalItems: number
  runId: string | null
  minutesOverdue: number
}

function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  return new Date(aest.toISOString().split("T")[0])
}

function currentAestHour(): number {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  return aest.getUTCHours()
}

function currentAestMinutes(): number {
  // Minutes since local midnight in AEST
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  return aest.getUTCHours() * 60 + aest.getUTCMinutes()
}

/**
 * Query of record for the overdue banner + alert cron.
 *
 * A template is considered overdue today when:
 *   - it has a dueByHour set
 *   - the current AEST hour is >= dueByHour
 *   - for each venue that should run it, either
 *       no ChecklistRun exists for (template, venue, today), OR
 *       the run exists and has unchecked items
 *
 * Returns one row per (template, venue) so managers can see exactly
 * where to deploy a closer.
 */
export async function getOverdueChecklists(): Promise<OverdueRun[]> {
  const today = todayAest()
  const currentHour = currentAestHour()
  const currentMinutes = currentAestMinutes()

  const templates = await db.checklistTemplate.findMany({
    where: {
      isActive: true,
      dueByHour: { not: null, lte: currentHour },
    },
    include: {
      _count: { select: { items: { where: { archived: false } } } },
      runs: {
        where: { runDate: today },
        include: {
          _count: { select: { items: true } },
          items: { select: { checkedAt: true } },
        },
      },
    },
  })

  const overdue: OverdueRun[] = []
  for (const t of templates) {
    const expectedVenues: Venue[] =
      t.venue === "BOTH"
        ? (["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as Venue[])
        : [t.venue]

    for (const v of expectedVenues) {
      const run = t.runs.find((r) => r.venue === v)
      const completed = run
        ? run.items.filter((i) => i.checkedAt !== null).length
        : 0
      const total = run?._count.items ?? t._count.items
      if (run && completed >= total && total > 0) continue

      const minutesOverdue =
        currentMinutes - (t.dueByHour ?? 0) * 60

      const existingAlert = await db.checklistAlert.findUnique({
        where: {
          templateId_venue_runDate: {
            templateId: t.id,
            venue: v,
            runDate: today,
          },
        },
      })

      overdue.push({
        alertId: existingAlert?.id ?? null,
        templateId: t.id,
        templateName: t.name,
        area: t.area,
        venue: v,
        runDate: today.toISOString().split("T")[0],
        dueByHour: t.dueByHour ?? 0,
        completedItems: completed,
        totalItems: total,
        runId: run?.id ?? null,
        minutesOverdue: Math.max(minutesOverdue, 0),
      })
    }
  }
  overdue.sort((a, b) => b.minutesOverdue - a.minutesOverdue)
  return overdue
}

/**
 * Called by the alert cron (see /api/cron/checklist-alerts). Idempotent —
 * we upsert a ChecklistAlert row per (template, venue, date) so repeat
 * cron hits don't spam. `emailedAt` is set on first send; subsequent
 * passes won't re-send unless you explicitly reset it.
 *
 * Returns the list of alerts that need an email delivered.
 */
export async function materialiseOverdueAlerts(): Promise<
  {
    alertId: string
    templateName: string
    venue: Venue
    runDate: string
    emailsTo: string[]
    completedItems: number
    totalItems: number
    minutesOverdue: number
  }[]
> {
  const overdue = await getOverdueChecklists()
  const out: Awaited<ReturnType<typeof materialiseOverdueAlerts>> = []

  for (const o of overdue) {
    const template = await db.checklistTemplate.findUnique({
      where: { id: o.templateId },
      select: { alertEmails: true, name: true },
    })
    if (!template) continue

    // Skip when there are no addressees (no-op alert)
    if (template.alertEmails.length === 0) continue

    const existing = await db.checklistAlert.findUnique({
      where: {
        templateId_venue_runDate: {
          templateId: o.templateId,
          venue: o.venue,
          runDate: new Date(o.runDate),
        },
      },
    })

    if (existing) {
      // Resolve automatically if checklist was completed since last run
      if (
        o.completedItems >= o.totalItems &&
        o.totalItems > 0 &&
        !existing.resolvedAt
      ) {
        await db.checklistAlert.update({
          where: { id: existing.id },
          data: { resolvedAt: new Date() },
        })
      }
      // Don't re-email if we already sent one
      if (existing.emailedAt) continue
      out.push({
        alertId: existing.id,
        templateName: template.name,
        venue: o.venue,
        runDate: o.runDate,
        emailsTo: template.alertEmails,
        completedItems: o.completedItems,
        totalItems: o.totalItems,
        minutesOverdue: o.minutesOverdue,
      })
    } else {
      const created = await db.checklistAlert.create({
        data: {
          templateId: o.templateId,
          venue: o.venue,
          runDate: new Date(o.runDate),
          completedItems: o.completedItems,
          totalItems: o.totalItems,
          emailedTo: template.alertEmails,
        },
      })
      out.push({
        alertId: created.id,
        templateName: template.name,
        venue: o.venue,
        runDate: o.runDate,
        emailsTo: template.alertEmails,
        completedItems: o.completedItems,
        totalItems: o.totalItems,
        minutesOverdue: o.minutesOverdue,
      })
    }
  }
  return out
}

export async function markAlertEmailed(alertId: string) {
  await db.checklistAlert.update({
    where: { id: alertId },
    data: { emailedAt: new Date() },
  })
  revalidatePath("/checklists")
}

// ─── DAILY SUMMARY ──────────────────────────────────────────────────────────

export interface DailySummaryVenue {
  venue: Venue
  rows: {
    name: string
    area: string | null
    status: "COMPLETED" | "PARTIAL" | "NOT_STARTED"
    completedItems: number
    totalItems: number
    completedAt: string | null
    staffNames: string[]
  }[]
}

export async function getDailySummaryData(): Promise<{
  date: string
  venues: DailySummaryVenue[]
  totalTemplates: number
  totalIncomplete: number
}> {
  const today = todayAest()

  const templates = await db.checklistTemplate.findMany({
    where: { isActive: true, dueByHour: { not: null } },
    include: {
      _count: { select: { items: { where: { archived: false } } } },
      runs: {
        where: { runDate: today },
        include: {
          items: { select: { checkedAt: true, checkedBy: true } },
        },
      },
    },
    orderBy: [{ venue: "asc" }, { area: "asc" }, { name: "asc" }],
  })

  const venueMap = new Map<Venue, DailySummaryVenue["rows"]>()

  for (const t of templates) {
    const expectedVenues: Venue[] =
      t.venue === "BOTH"
        ? (["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as Venue[])
        : [t.venue]

    for (const v of expectedVenues) {
      const run = t.runs.find((r) => r.venue === v)
      const completed = run
        ? run.items.filter((i) => i.checkedAt !== null).length
        : 0
      const total = t._count.items
      const staffNames = run
        ? [...new Set(run.items.map((i) => i.checkedBy).filter(Boolean) as string[])]
        : []

      let status: "COMPLETED" | "PARTIAL" | "NOT_STARTED"
      if (!run || completed === 0) status = "NOT_STARTED"
      else if (completed >= total) status = "COMPLETED"
      else status = "PARTIAL"

      const completedAt =
        run?.items
          .map((i) => i.checkedAt)
          .filter(Boolean)
          .sort()
          .pop()
          ?.toLocaleTimeString("en-AU", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Australia/Brisbane",
          }) ?? null

      if (!venueMap.has(v)) venueMap.set(v, [])
      venueMap.get(v)!.push({
        name: t.name,
        area: t.area,
        status,
        completedItems: completed,
        totalItems: total,
        completedAt,
        staffNames,
      })
    }
  }

  const VENUE_ORDER: Venue[] = ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]
  const venues: DailySummaryVenue[] = VENUE_ORDER.filter((v) =>
    venueMap.has(v)
  ).map((v) => ({ venue: v, rows: venueMap.get(v)! }))

  const allRows = venues.flatMap((v) => v.rows)
  return {
    date: today.toISOString().split("T")[0],
    venues,
    totalTemplates: allRows.length,
    totalIncomplete: allRows.filter((r) => r.status !== "COMPLETED").length,
  }
}

// ─── CYCLE-END NUDGE (weekly / monthly) ─────────────────────────────────────
// One quiet email near the close of each weekly (Sat/Sun) and monthly (last
// few days) cycle, listing the items still not done so Chloe can see what got
// left behind before the list rolls over. Idempotent per cycle via
// ChecklistAlert, so at most one nudge per template per cycle. This is the
// low-noise replacement for the paused every-15-min daily checklist crons.

function ymd(d: Date): string {
  return d.toISOString().split("T")[0]
}

/** Mirror of the anchor logic in checklists.ts (kept local — checklists.ts is
 *  a "use server" module and can't export a sync helper). */
function cycleAnchor(cadence: ChecklistCadence, ref?: Date): Date {
  const base = ref ? new Date(ymd(ref)) : todayAest()
  if (cadence === "WEEKLY") {
    const d = new Date(base)
    const daysSinceMonday = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - daysSinceMonday)
    return d
  }
  if (cadence === "MONTHLY") {
    const d = new Date(base)
    d.setUTCDate(1)
    return d
  }
  return base
}

export interface CycleOpenItem {
  label: string
  /** ISO timestamp this line was last ticked in ANY prior run, or null. */
  lastDone: string | null
}

export interface CycleEndingRow {
  templateId: string
  templateName: string
  area: string | null
  venue: Venue
  cadence: "WEEKLY" | "MONTHLY"
  /** Human cycle label, e.g. "week of Mon 21 Jul" or "July 2026". */
  cycleLabel: string
  /** Whole days left in the cycle (0 = last day). */
  daysLeft: number
  totalItems: number
  openItems: CycleOpenItem[]
}

function cycleLabelFor(cadence: ChecklistCadence, anchor: Date): string {
  if (cadence === "MONTHLY") {
    return anchor.toLocaleDateString("en-AU", {
      month: "long",
      year: "numeric",
      timeZone: "Australia/Brisbane",
    })
  }
  const day = anchor.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    timeZone: "Australia/Brisbane",
  })
  return `week of Mon ${day}`
}

type CycleTemplate = {
  id: string
  name: string
  area: string | null
  venue: Venue
  cadence: ChecklistCadence
  items: { id: string; label: string }[]
}

function fetchCycleTemplates(cadences: ("WEEKLY" | "MONTHLY")[]) {
  return db.checklistTemplate.findMany({
    where: { isActive: true, cadence: { in: cadences } },
    include: {
      items: {
        where: { archived: false },
        select: { id: true, label: true },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ venue: "asc" }, { area: "asc" }, { name: "asc" }],
  })
}

function venuesFor(templateVenue: Venue): Venue[] {
  return templateVenue === "BOTH"
    ? (["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"] as Venue[])
    : [templateVenue]
}

const weeklyDaysLeft = (dow: number) => 6 - ((dow + 6) % 7) // Sat→1, Sun→0

/** Read-only: build the row for one template+venue+cycle, or null if the cycle
 *  is already fully done. Does not write anything. */
async function buildCycleRow(
  t: CycleTemplate,
  v: Venue,
  anchor: Date,
  daysLeft: number
): Promise<CycleEndingRow | null> {
  const run = await db.checklistRun.findFirst({
    where: { templateId: t.id, venue: v, runDate: anchor },
    include: { items: { select: { templateItemId: true, checkedAt: true } } },
  })
  const checkedThisCycle = new Set(
    (run?.items ?? [])
      .filter((i) => i.checkedAt !== null)
      .map((i) => i.templateItemId)
  )
  const openItems = t.items.filter((it) => !checkedThisCycle.has(it.id))
  if (openItems.length === 0) return null // fully done this cycle

  // Per-item last-done across ALL history, for rolling visibility on lines
  // that have gone untouched for a while.
  const history = await db.checklistRunItem.findMany({
    where: {
      run: { templateId: t.id, venue: v },
      checkedAt: { not: null },
      templateItemId: { in: openItems.map((i) => i.id) },
    },
    select: { templateItemId: true, checkedAt: true },
  })
  const lastDone = new Map<string, Date>()
  for (const h of history) {
    if (!h.checkedAt) continue
    const prev = lastDone.get(h.templateItemId)
    if (!prev || h.checkedAt > prev) lastDone.set(h.templateItemId, h.checkedAt)
  }

  return {
    templateId: t.id,
    templateName: t.name,
    area: t.area,
    venue: v,
    cadence: t.cadence as "WEEKLY" | "MONTHLY",
    cycleLabel: cycleLabelFor(t.cadence, anchor),
    daysLeft,
    totalItems: t.items.length,
    openItems: openItems.map((it) => ({
      label: it.label,
      lastDone: lastDone.get(it.id)?.toISOString() ?? null,
    })),
  }
}

/**
 * Find weekly/monthly checklists whose cycle is nearly up and still has open
 * items. Creates (idempotently) a ChecklistAlert per (template, venue, cycle)
 * and returns the rows to email plus the alert ids to mark emailed after send.
 *
 * Fires the WEEKLY set on Sat + Sun (Sat is the nudge; Sun is a retry if
 * Saturday's email failed — idempotency stops a double send). Fires MONTHLY
 * across the last 4 days of the month.
 */
export async function getCycleEndingChecklists(): Promise<{
  rows: CycleEndingRow[]
  alertIds: string[]
}> {
  const today = todayAest()
  const dow = today.getUTCDay() // 0=Sun..6=Sat
  const dayOfMonth = today.getUTCDate()
  const lastOfMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const daysLeftInMonth = lastOfMonth - dayOfMonth

  const cadences: ("WEEKLY" | "MONTHLY")[] = []
  if (dow === 6 || dow === 0) cadences.push("WEEKLY")
  if (daysLeftInMonth <= 3) cadences.push("MONTHLY")
  if (cadences.length === 0) return { rows: [], alertIds: [] }

  const templates = await fetchCycleTemplates(cadences)
  const rows: CycleEndingRow[] = []
  const alertIds: string[] = []

  for (const t of templates) {
    if (t.items.length === 0) continue
    const anchor = cycleAnchor(t.cadence)
    const daysLeft =
      t.cadence === "WEEKLY" ? weeklyDaysLeft(dow) : daysLeftInMonth

    for (const v of venuesFor(t.venue)) {
      const row = await buildCycleRow(t, v, anchor, daysLeft)
      if (!row) continue

      const existing = await db.checklistAlert.findUnique({
        where: {
          templateId_venue_runDate: { templateId: t.id, venue: v, runDate: anchor },
        },
      })
      if (existing?.emailedAt) continue // already nudged this cycle

      const alert =
        existing ??
        (await db.checklistAlert.create({
          data: {
            templateId: t.id,
            venue: v,
            runDate: anchor,
            completedItems: row.totalItems - row.openItems.length,
            totalItems: row.totalItems,
            emailedTo: ["chloe@tarte.com.au"],
          },
        }))
      alertIds.push(alert.id)
      rows.push(row)
    }
  }

  return { rows, alertIds }
}

/**
 * Read-only preview of what the cycle nudge would list right now: forces both
 * cadences, ignores the day-of-cycle gate and the "already emailed" flag, and
 * writes nothing. Backs the cron endpoint's ?preview=1 for manual checks.
 */
export async function previewCycleEndingChecklists(): Promise<CycleEndingRow[]> {
  const today = todayAest()
  const dow = today.getUTCDay()
  const dayOfMonth = today.getUTCDate()
  const lastOfMonth = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)
  ).getUTCDate()
  const daysLeftInMonth = lastOfMonth - dayOfMonth

  const templates = await fetchCycleTemplates(["WEEKLY", "MONTHLY"])
  const rows: CycleEndingRow[] = []

  for (const t of templates) {
    if (t.items.length === 0) continue
    const anchor = cycleAnchor(t.cadence)
    const daysLeft =
      t.cadence === "WEEKLY" ? weeklyDaysLeft(dow) : daysLeftInMonth
    for (const v of venuesFor(t.venue)) {
      const row = await buildCycleRow(t, v, anchor, daysLeft)
      if (row) rows.push(row)
    }
  }

  return rows
}

export async function markCycleAlertsEmailed(alertIds: string[]) {
  if (alertIds.length === 0) return
  await db.checklistAlert.updateMany({
    where: { id: { in: alertIds } },
    data: { emailedAt: new Date() },
  })
}
