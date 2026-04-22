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
import { sendFoodSafetyEmail } from "@/lib/gmail/send"

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
    hotCheck: boolean
    checkedAt: string | null
    checkedBy: string | null
    tempCelsius: number | null
    note: string | null
  }[]
  photos: {
    id: string
    url: string
    publicId: string
    uploadedBy: string | null
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
      photos: { orderBy: { uploadedAt: "asc" } },
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
      hotCheck: i.templateItem.hotCheck,
      checkedAt: i.checkedAt ? i.checkedAt.toISOString() : null,
      checkedBy: i.checkedBy,
      tempCelsius: i.tempCelsius !== null ? Number(i.tempCelsius) : null,
      note: i.note,
    })),
    photos: run.photos.map((p) => ({
      id: p.id,
      url: p.url,
      publicId: p.publicId,
      uploadedBy: p.uploadedBy,
    })),
  }
}

export async function forceCompleteRun(runId: string) {
  const completedAt = new Date()
  const completedRun = await db.checklistRun.update({
    where: { id: runId },
    data: { status: "COMPLETED", completedAt },
    include: {
      template: { select: { name: true, isFoodSafety: true } },
      items: {
        include: { templateItem: { select: { label: true, requireTemp: true, hotCheck: true } } },
        orderBy: { templateItem: { sortOrder: "asc" } },
      },
    },
  })
  if (completedRun.template.isFoodSafety) {
    const staffNames = [
      ...new Set(completedRun.items.map((i) => i.checkedBy).filter(Boolean) as string[]),
    ]
    sendFoodSafetyEmail({
      venue: completedRun.venue,
      templateName: completedRun.template.name,
      runDate: completedRun.runDate.toISOString().split("T")[0],
      completedAt,
      staffNames,
      items: completedRun.items.map((i) => {
        const temp = i.tempCelsius !== null ? Number(i.tempCelsius) : null
        return {
          label: i.templateItem.label,
          tempCelsius: temp,
          requireTemp: i.templateItem.requireTemp,
          passed: i.templateItem.requireTemp && temp !== null
            ? i.templateItem.hotCheck ? temp >= 60 : temp <= 5
            : null,
          note: i.note,
          checkedBy: i.checkedBy,
        }
      }),
    }).catch((err) => console.error("[food-safety-email]", err))
  }
  revalidatePath(`/checklists/runs/${runId}`)
  revalidatePath("/checklists")
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
    const completedAt = new Date()
    const completedRun = await db.checklistRun.update({
      where: { id: params.runId },
      data: { status: "COMPLETED", completedAt },
      include: {
        template: { select: { name: true, isFoodSafety: true } },
        items: {
          include: { templateItem: { select: { label: true, requireTemp: true, hotCheck: true } } },
          orderBy: { templateItem: { sortOrder: "asc" } },
        },
      },
    })

    if (completedRun.template.isFoodSafety) {
      const staffNames = [
        ...new Set(completedRun.items.map((i) => i.checkedBy).filter(Boolean) as string[]),
      ]
      sendFoodSafetyEmail({
        venue: completedRun.venue,
        templateName: completedRun.template.name,
        runDate: completedRun.runDate.toISOString().split("T")[0],
        completedAt,
        staffNames,
        items: completedRun.items.map((i) => {
          const temp = i.tempCelsius !== null ? Number(i.tempCelsius) : null
          return {
            label: i.templateItem.label,
            tempCelsius: temp,
            requireTemp: i.templateItem.requireTemp,
            passed: i.templateItem.requireTemp && temp !== null
            ? i.templateItem.hotCheck ? temp >= 60 : temp <= 5
            : null,
            note: i.note,
            checkedBy: i.checkedBy,
          }
        }),
      }).catch((err) => console.error("[food-safety-email]", err))
    }
  } else {
    await db.checklistRun.update({
      where: { id: params.runId },
      data: { status: "IN_PROGRESS", completedAt: null },
    })
  }
  revalidatePath(`/checklists/runs/${params.runId}`)
  revalidatePath("/checklists")
}

// ─── FOOD SAFETY LOG ────────────────────────────────────────────────────────

export interface FoodSafetyRun {
  id: string
  date: string
  venue: Venue
  templateName: string
  status: ChecklistRunStatus
  completedAt: string | null
  staffNames: string[]
  items: {
    label: string
    tempCelsius: number | null
    note: string | null
    checkedAt: string | null
    checkedBy: string | null
    requireTemp: boolean
    hotCheck: boolean
    passed: boolean | null // null = temp not required or not yet entered
  }[]
}

export async function getFoodSafetyLog(params?: {
  venue?: Venue
  dateFrom?: string
  dateTo?: string
}): Promise<FoodSafetyRun[]> {
  const where: Record<string, unknown> = {
    template: { isFoodSafety: true },
  }
  if (params?.venue) where.venue = params.venue
  if (params?.dateFrom || params?.dateTo) {
    where.runDate = {}
    if (params.dateFrom)
      (where.runDate as Record<string, unknown>).gte = new Date(params.dateFrom)
    if (params.dateTo)
      (where.runDate as Record<string, unknown>).lte = new Date(params.dateTo)
  }

  const runs = await db.checklistRun.findMany({
    where,
    orderBy: { runDate: "desc" },
    include: {
      template: { select: { name: true } },
      items: {
        include: { templateItem: { select: { label: true, requireTemp: true, hotCheck: true } } },
        orderBy: { templateItem: { sortOrder: "asc" } },
      },
    },
  })

  return runs.map((run) => {
    const staffNames = [
      ...new Set(run.items.map((i) => i.checkedBy).filter(Boolean) as string[]),
    ]
    return {
      id: run.id,
      date: run.runDate.toISOString().split("T")[0],
      venue: run.venue,
      templateName: run.template.name,
      status: run.status,
      completedAt: run.completedAt ? run.completedAt.toISOString() : null,
      staffNames,
      items: run.items.map((i) => {
        const temp = i.tempCelsius !== null ? Number(i.tempCelsius) : null
        const passed =
          i.templateItem.requireTemp && temp !== null
            ? i.templateItem.hotCheck ? temp >= 60 : temp <= 5
            : null
        return {
          label: i.templateItem.label,
          tempCelsius: temp,
          note: i.note,
          checkedAt: i.checkedAt ? i.checkedAt.toISOString() : null,
          checkedBy: i.checkedBy,
          requireTemp: i.templateItem.requireTemp,
          hotCheck: i.templateItem.hotCheck,
          passed,
        }
      }),
    }
  })
}

// ─── CHECKLIST PHOTOS ───────────────────────────────────────────────────────

export async function saveChecklistPhoto(params: {
  runId: string
  url: string
  publicId: string
  uploadedBy?: string | null
}) {
  await db.checklistRunPhoto.create({
    data: {
      id: crypto.randomUUID(),
      runId: params.runId,
      url: params.url,
      publicId: params.publicId,
      uploadedBy: params.uploadedBy ?? null,
    },
  })
  revalidatePath(`/checklists/runs/${params.runId}`)
}

export async function deleteChecklistPhoto(params: {
  photoId: string
  runId: string
}) {
  await db.checklistRunPhoto.delete({ where: { id: params.photoId } })
  revalidatePath(`/checklists/runs/${params.runId}`)
}

export async function getChecklistPhotos(runId: string) {
  return db.checklistRunPhoto.findMany({
    where: { runId },
    orderBy: { uploadedAt: "asc" },
  })
}
