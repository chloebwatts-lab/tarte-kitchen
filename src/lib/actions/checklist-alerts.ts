"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"

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
      _count: { select: { items: true } },
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
