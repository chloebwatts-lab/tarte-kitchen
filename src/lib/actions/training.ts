"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue } from "@/generated/prisma"

export interface TrainingRecordDto {
  id: string
  venue: Venue
  staffName: string
  role: string | null
  onlineCourse: string | null
  onlineCourseDate: string | null // YYYY-MM-DD
  certificateSighted: boolean
  allergenTrainedAt: string | null
  inductionAt: string | null
  illnessPolicyAt: string | null
  recordsTrainedAt: string | null
  verifiedBy: string | null
  verifiedAt: string | null
  notes: string | null
  /// All five training items dated + verified.
  complete: boolean
}

export interface TrainingRecordInput {
  staffName: string
  role?: string | null
  onlineCourse?: string | null
  onlineCourseDate?: string | null // YYYY-MM-DD from <input type="date">
  certificateSighted?: boolean
  allergenTrainedAt?: string | null
  inductionAt?: string | null
  illnessPolicyAt?: string | null
  recordsTrainedAt?: string | null
  verifiedBy?: string | null
  verifiedAt?: string | null
  notes?: string | null
}

/** Date-only columns: store as UTC midnight so the date part round-trips. */
function toDate(d: string | null | undefined): Date | null {
  if (!d) return null
  const parsed = new Date(`${d}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function fromDate(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

function toDto(row: {
  id: string
  venue: Venue
  staffName: string
  role: string | null
  onlineCourse: string | null
  onlineCourseDate: Date | null
  certificateSighted: boolean
  allergenTrainedAt: Date | null
  inductionAt: Date | null
  illnessPolicyAt: Date | null
  recordsTrainedAt: Date | null
  verifiedBy: string | null
  verifiedAt: Date | null
  notes: string | null
}): TrainingRecordDto {
  const complete =
    row.onlineCourseDate !== null &&
    row.allergenTrainedAt !== null &&
    row.inductionAt !== null &&
    row.illnessPolicyAt !== null &&
    row.recordsTrainedAt !== null &&
    !!row.verifiedBy
  return {
    id: row.id,
    venue: row.venue,
    staffName: row.staffName,
    role: row.role,
    onlineCourse: row.onlineCourse,
    onlineCourseDate: fromDate(row.onlineCourseDate),
    certificateSighted: row.certificateSighted,
    allergenTrainedAt: fromDate(row.allergenTrainedAt),
    inductionAt: fromDate(row.inductionAt),
    illnessPolicyAt: fromDate(row.illnessPolicyAt),
    recordsTrainedAt: fromDate(row.recordsTrainedAt),
    verifiedBy: row.verifiedBy,
    verifiedAt: fromDate(row.verifiedAt),
    notes: row.notes,
    complete,
  }
}

function normalise(params: TrainingRecordInput) {
  return {
    staffName: params.staffName.trim(),
    role: params.role?.trim() || null,
    onlineCourse: params.onlineCourse?.trim() || null,
    onlineCourseDate: toDate(params.onlineCourseDate),
    certificateSighted: params.certificateSighted ?? false,
    allergenTrainedAt: toDate(params.allergenTrainedAt),
    inductionAt: toDate(params.inductionAt),
    illnessPolicyAt: toDate(params.illnessPolicyAt),
    recordsTrainedAt: toDate(params.recordsTrainedAt),
    verifiedBy: params.verifiedBy?.trim() || null,
    verifiedAt: toDate(params.verifiedAt),
    notes: params.notes?.trim() || null,
  }
}

function revalidate() {
  revalidatePath("/kitchen/training")
  for (const v of ["BURLEIGH", "BEACH_HOUSE", "TEA_GARDEN"]) {
    revalidatePath(`/council/${v}`)
  }
}

export async function createTrainingRecord(
  venue: Venue,
  params: TrainingRecordInput
): Promise<string> {
  if (!params.staffName.trim()) throw new Error("Staff name is required")
  const row = await db.trainingRecord.create({
    data: { venue, ...normalise(params) },
  })
  revalidate()
  return row.id
}

export async function updateTrainingRecord(
  id: string,
  params: TrainingRecordInput
): Promise<void> {
  if (!params.staffName.trim()) throw new Error("Staff name is required")
  await db.trainingRecord.update({ where: { id }, data: normalise(params) })
  revalidate()
}

export async function deleteTrainingRecord(id: string): Promise<void> {
  await db.trainingRecord.delete({ where: { id } })
  revalidate()
}

export async function listTrainingRecords(
  venue: Venue
): Promise<TrainingRecordDto[]> {
  const rows = await db.trainingRecord.findMany({
    where: { venue },
    orderBy: [{ staffName: "asc" }],
  })
  return rows.map(toDto)
}
