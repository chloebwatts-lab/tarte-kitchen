"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue, ServiceVisitKind } from "@/generated/prisma/client"
import {
  SERVICE_CATEGORIES,
  SERVICE_CATEGORY_BY_KEY,
  computeSchedule,
  serviceCategoryLabel,
  type ProgramSchedule,
} from "@/lib/services/constants"

/** Venues that run their own service calendar (Tea Garden folds into
 * the Currumbin site, same as the maintenance module). */
const SERVICE_VENUES: Venue[] = ["BURLEIGH", "BEACH_HOUSE"]

/**
 * Idempotent: creates the standard programs any venue should track if
 * they don't exist yet. Runs on page load so the calendar is never
 * empty; additive only.
 */
export async function ensureDefaultPrograms() {
  const existing = await db.serviceProgram.findMany({
    select: { venue: true, category: true },
  })
  const have = new Set(existing.map((p) => `${p.venue}:${p.category}`))
  const toCreate: Array<{ venue: Venue; category: string; intervalDays: number | null }> = []
  for (const venue of SERVICE_VENUES) {
    for (const cat of SERVICE_CATEGORIES) {
      if (!cat.seed || have.has(`${venue}:${cat.key}`)) continue
      toCreate.push({ venue, category: cat.key, intervalDays: cat.defaultIntervalDays })
    }
  }
  if (toCreate.length) {
    await db.serviceProgram.createMany({ data: toCreate })
  }
}

export interface ServiceVisitRow {
  id: string
  kind: ServiceVisitKind
  serviceDate: string // YYYY-MM-DD
  providerName: string | null
  costCents: number | null
  source: "EMAIL" | "MANUAL"
  needsReview: boolean
  emailSubject: string | null
  recordedBy: string | null
  notes: string | null
}

export interface ServiceProgramRow {
  id: string
  venue: Venue
  category: string
  label: string | null
  displayLabel: string
  blurb: string
  providerName: string | null
  providerPhone: string | null
  providerEmails: string[]
  intervalDays: number | null
  notes: string | null
  active: boolean
  schedule: {
    lastDone: string | null
    nextBooked: string | null
    nextDue: string | null
    status: ProgramSchedule["status"]
  }
  visits: ServiceVisitRow[]
}

function toDateStr(d: Date | null): string | null {
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

export async function getServicePrograms(opts?: {
  venue?: Venue
  includeInactive?: boolean
}): Promise<ServiceProgramRow[]> {
  await ensureDefaultPrograms()
  const programs = await db.serviceProgram.findMany({
    where: {
      ...(opts?.venue ? { venue: opts.venue } : {}),
      ...(opts?.includeInactive ? {} : { active: true }),
    },
    include: { visits: { orderBy: { serviceDate: "desc" } } },
  })

  const rows = programs.map((p) => {
    const schedule = computeSchedule(
      p,
      p.visits.map((v) => ({ kind: v.kind, serviceDate: v.serviceDate }))
    )
    return {
      id: p.id,
      venue: p.venue,
      category: p.category,
      label: p.label,
      displayLabel: serviceCategoryLabel(p.category, p.label),
      blurb: SERVICE_CATEGORY_BY_KEY[p.category]?.blurb ?? "",
      providerName: p.providerName,
      providerPhone: p.providerPhone,
      providerEmails: p.providerEmails,
      intervalDays: p.intervalDays,
      notes: p.notes,
      active: p.active,
      schedule: {
        lastDone: toDateStr(schedule.lastDone),
        nextBooked: toDateStr(schedule.nextBooked),
        nextDue: toDateStr(schedule.nextDue),
        status: schedule.status,
      },
      visits: p.visits.map((v) => ({
        id: v.id,
        kind: v.kind,
        serviceDate: toDateStr(v.serviceDate)!,
        providerName: v.providerName,
        costCents: v.costCents,
        source: v.source,
        needsReview: v.needsReview,
        emailSubject: v.emailSubject,
        recordedBy: v.recordedBy,
        notes: v.notes,
      })),
    }
  })

  // Overdue first, then due-soonest; no-record and ad-hoc sink.
  const statusRank = { OVERDUE: 0, DUE_SOON: 1, BOOKED: 2, OK: 3, NO_RECORD: 4 }
  rows.sort((a, b) => {
    const r = statusRank[a.schedule.status] - statusRank[b.schedule.status]
    if (r !== 0) return r
    return (a.schedule.nextDue ?? "9999") < (b.schedule.nextDue ?? "9999") ? -1 : 1
  })
  return rows
}

function revalidateServicePages() {
  revalidatePath("/kitchen/services")
  revalidatePath("/services")
}

// ── Staff (kiosk, no auth): mark a service as done today ────────────────────

export interface StaffMarkDoneInput {
  programId: string
  serviceDate: string // YYYY-MM-DD
  recordedBy: string
  providerName?: string
  notes?: string
}

export async function staffMarkServiceDone(input: StaffMarkDoneInput) {
  if (!input.recordedBy.trim()) throw new Error("Name is required")
  const date = new Date(`${input.serviceDate}T00:00:00`)
  if (isNaN(date.getTime())) throw new Error("Bad date")
  await db.serviceVisit.create({
    data: {
      programId: input.programId,
      kind: "COMPLETED",
      serviceDate: date,
      source: "MANUAL",
      recordedBy: input.recordedBy.trim(),
      providerName: input.providerName?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  })
  revalidateServicePages()
}

// ── Admin: programs ─────────────────────────────────────────────────────────

export interface ProgramInput {
  id?: string
  venue: Venue
  category: string
  label?: string
  providerName?: string
  providerPhone?: string
  providerEmails?: string[]
  intervalDays?: number | null
  notes?: string
  active?: boolean
}

export async function upsertServiceProgram(input: ProgramInput) {
  const data = {
    venue: input.venue,
    category: input.category,
    label: input.label?.trim() || null,
    providerName: input.providerName?.trim() || null,
    providerPhone: input.providerPhone?.trim() || null,
    providerEmails: (input.providerEmails ?? [])
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    intervalDays: input.intervalDays ?? null,
    notes: input.notes?.trim() || null,
    active: input.active ?? true,
  }
  if (input.id) {
    await db.serviceProgram.update({ where: { id: input.id }, data })
  } else {
    await db.serviceProgram.create({ data })
  }
  revalidateServicePages()
}

// ── Admin: visits ───────────────────────────────────────────────────────────

export interface VisitInput {
  id?: string
  programId: string
  kind: ServiceVisitKind
  serviceDate: string // YYYY-MM-DD
  providerName?: string
  costCents?: number | null
  notes?: string
}

export async function upsertServiceVisit(input: VisitInput) {
  const date = new Date(`${input.serviceDate}T00:00:00`)
  if (isNaN(date.getTime())) throw new Error("Bad date")
  const data = {
    kind: input.kind,
    serviceDate: date,
    providerName: input.providerName?.trim() || null,
    costCents: input.costCents ?? null,
    notes: input.notes?.trim() || null,
  }
  if (input.id) {
    // Editing an email-detected row counts as reviewing it.
    await db.serviceVisit.update({
      where: { id: input.id },
      data: { ...data, needsReview: false },
    })
  } else {
    await db.serviceVisit.create({
      data: { ...data, programId: input.programId, source: "MANUAL" },
    })
  }
  revalidateServicePages()
}

export async function confirmServiceVisit(id: string) {
  await db.serviceVisit.update({ where: { id }, data: { needsReview: false } })
  revalidateServicePages()
}

/** A booked visit actually happened: flip it to COMPLETED. */
export async function markVisitCompleted(id: string, serviceDate?: string) {
  const data: { kind: ServiceVisitKind; needsReview: boolean; serviceDate?: Date } = {
    kind: "COMPLETED",
    needsReview: false,
  }
  if (serviceDate) {
    const d = new Date(`${serviceDate}T00:00:00`)
    if (!isNaN(d.getTime())) data.serviceDate = d
  }
  await db.serviceVisit.update({ where: { id }, data })
  revalidateServicePages()
}

/** Per-action delete of a single visit (misdetections). */
export async function deleteServiceVisit(id: string) {
  await db.serviceVisit.delete({ where: { id } })
  revalidateServicePages()
}

export async function getReviewQueueCount(): Promise<number> {
  return db.serviceVisit.count({ where: { needsReview: true } })
}
