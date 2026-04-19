"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import {
  Venue,
  ChecklistCadence,
  ChecklistShift,
  ChecklistRunStatus,
} from "@/generated/prisma"
import Decimal from "decimal.js"

export interface ChecklistTemplateSummary {
  id: string
  name: string
  area: string | null
  venue: Venue
  cadence: ChecklistCadence
  shift: ChecklistShift
  isFoodSafety: boolean
  itemCount: number
  todayRun: {
    id: string
    status: ChecklistRunStatus
    completedItems: number
    totalItems: number
  } | null
}

export interface ChecklistRunDetail {
  id: string
  templateId: string
  templateName: string
  area: string | null
  venue: Venue
  runDate: string
  shift: ChecklistShift
  status: ChecklistRunStatus
  isFoodSafety: boolean
  items: {
    id: string
    label: string
    instructions: string | null
    requireTemp: boolean
    requireNote: boolean
    checkedAt: string | null
    checkedBy: string | null
    tempCelsius: number | null
    note: string | null
  }[]
}

function todayAest(): Date {
  const now = new Date()
  const aest = new Date(now.getTime() + 10 * 60 * 60 * 1000)
  aest.setUTCHours(0, 0, 0, 0)
  return new Date(aest.toISOString().split("T")[0])
}

export async function listChecklistTemplates(params?: {
  venue?: Venue | "ALL"
}): Promise<ChecklistTemplateSummary[]> {
  const venueFilter =
    !params?.venue || params.venue === "ALL"
      ? {}
      : { venue: { in: [params.venue, "BOTH"] as Venue[] } }
  const templates = await db.checklistTemplate.findMany({
    where: { isActive: true, ...venueFilter },
    include: {
      _count: { select: { items: true } },
      runs: {
        where: { runDate: todayAest() },
        include: { _count: { select: { items: true } }, items: { select: { checkedAt: true } } },
        take: 3,
      },
    },
    orderBy: [{ cadence: "asc" }, { name: "asc" }],
  })

  return templates.map((t) => {
    const firstRun = t.runs[0]
    const completed = firstRun
      ? firstRun.items.filter((i) => i.checkedAt !== null).length
      : 0
    return {
      id: t.id,
      name: t.name,
      area: t.area,
      venue: t.venue,
      cadence: t.cadence,
      shift: t.shift,
      isFoodSafety: t.isFoodSafety,
      itemCount: t._count.items,
      todayRun: firstRun
        ? {
            id: firstRun.id,
            status: firstRun.status,
            completedItems: completed,
            totalItems: firstRun._count.items,
          }
        : null,
    }
  })
}

export async function createChecklistTemplate(params: {
  name: string
  area?: string
  venue: Venue
  cadence: ChecklistCadence
  shift?: ChecklistShift
  isFoodSafety?: boolean
  dueByHour?: number | null
  alertEmails?: string[]
  items: {
    label: string
    instructions?: string
    requireTemp?: boolean
    requireNote?: boolean
  }[]
}) {
  const template = await db.checklistTemplate.create({
    data: {
      name: params.name,
      area: params.area,
      venue: params.venue,
      cadence: params.cadence,
      shift: params.shift ?? "ANY",
      isFoodSafety: params.isFoodSafety ?? false,
      dueByHour:
        params.dueByHour !== undefined && params.dueByHour !== null
          ? params.dueByHour
          : null,
      alertEmails: params.alertEmails ?? [],
      items: {
        create: params.items.map((it, idx) => ({
          sortOrder: idx,
          label: it.label,
          instructions: it.instructions,
          requireTemp: it.requireTemp ?? false,
          requireNote: it.requireNote ?? false,
        })),
      },
    },
  })
  revalidatePath("/checklists")
  return template.id
}

/**
 * Idempotently create today's run for a template (or return existing).
 */
export async function startChecklistRun(params: {
  templateId: string
  venue: Venue
  shift?: ChecklistShift
}) {
  const date = todayAest()
  const shift = params.shift ?? "ANY"
  const existing = await db.checklistRun.findUnique({
    where: {
      templateId_venue_runDate_shift: {
        templateId: params.templateId,
        venue: params.venue,
        runDate: date,
        shift,
      },
    },
  })
  if (existing) {
    revalidatePath("/checklists")
    return existing.id
  }
  const items = await db.checklistTemplateItem.findMany({
    where: { templateId: params.templateId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  })
  const run = await db.checklistRun.create({
    data: {
      templateId: params.templateId,
      venue: params.venue,
      runDate: date,
      shift,
      status: "IN_PROGRESS",
      items: {
        create: items.map((i) => ({ templateItemId: i.id })),
      },
    },
  })
  revalidatePath("/checklists")
  return run.id
}

export async function getChecklistRun(id: string): Promise<ChecklistRunDetail | null> {
  const run = await db.checklistRun.findUnique({
    where: { id },
    include: {
      template: true,
      items: {
        include: { templateItem: true },
        orderBy: { templateItem: { sortOrder: "asc" } },
      },
    },
  })
  if (!run) return null
  return {
    id: run.id,
    templateId: run.templateId,
    templateName: run.template.name,
    area: run.template.area,
    venue: run.venue,
    runDate: run.runDate.toISOString().split("T")[0],
    shift: run.shift,
    status: run.status,
    isFoodSafety: run.template.isFoodSafety,
    items: run.items.map((i) => ({
      id: i.id,
      label: i.templateItem.label,
      instructions: i.templateItem.instructions,
      requireTemp: i.templateItem.requireTemp,
      requireNote: i.templateItem.requireNote,
      checkedAt: i.checkedAt ? i.checkedAt.toISOString() : null,
      checkedBy: i.checkedBy,
      tempCelsius: i.tempCelsius !== null ? Number(i.tempCelsius) : null,
      note: i.note,
    })),
  }
}

export async function tickChecklistItem(params: {
  runId: string
  runItemId: string
  checked: boolean
  tempCelsius?: number | null
  note?: string | null
  by?: string | null
}) {
  await db.checklistRunItem.update({
    where: { id: params.runItemId },
    data: {
      checkedAt: params.checked ? new Date() : null,
      checkedBy: params.checked ? params.by ?? null : null,
      tempCelsius:
        params.tempCelsius !== undefined && params.tempCelsius !== null
          ? new Decimal(params.tempCelsius)
          : params.tempCelsius === null
            ? null
            : undefined,
      note: params.note === undefined ? undefined : params.note,
    },
  })
  // If all items checked, mark run completed
  const remaining = await db.checklistRunItem.count({
    where: { runId: params.runId, checkedAt: null },
  })
  if (remaining === 0) {
    await db.checklistRun.update({
      where: { id: params.runId },
      data: { status: "COMPLETED", completedAt: new Date() },
    })
  } else {
    await db.checklistRun.update({
      where: { id: params.runId },
      data: { status: "IN_PROGRESS", completedAt: null },
    })
  }
  revalidatePath(`/checklists/runs/${params.runId}`)
  revalidatePath("/checklists")
}
