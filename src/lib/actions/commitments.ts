"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { CommitmentParty } from "@/generated/prisma/client"
import { AUTO_SOURCES } from "@/lib/commitments/auto"
import {
  boardWeekStarts,
  currentWeekStart,
  todayAest,
  ymd,
} from "@/lib/commitments/weeks"
import { oneOffStatus, type OneOffStatus } from "@/lib/commitments/shared"

// ─── Seeded standing commitments (from the paper Said + Done sheet) ──

const STANDING_SEEDS: Array<{
  slug: string
  title: string
  description: string | null
  sortOrder: number
  autoSource: string | null
}> = [
  {
    slug: "roster-3-weeks",
    title: "Roster posted 3 weeks ahead",
    description: "Staff can always see at least three future weeks.",
    sortOrder: 1,
    autoSource: "shifts-roster",
  },
  {
    slug: "portions-weighed",
    title: "Portions weighed every prep, every day",
    description: "Scales out at every prep — no eyeballing serves.",
    sortOrder: 2,
    autoSource: null,
  },
  {
    slug: "checklists-done",
    title: "Daily + weekly checklists done in the app",
    description: "Auto-checked from the checklist module's completion data.",
    sortOrder: 3,
    autoSource: "checklists",
  },
  {
    slug: "weekly-update-friday",
    title: "Weekly Update sent by Friday",
    description: "Paper is fine — photo it on the sheets page.",
    sortOrder: 4,
    autoSource: null,
  },
  {
    slug: "messages-same-day",
    title: "Messages answered same day",
    description: null,
    sortOrder: 5,
    autoSource: null,
  },
  {
    slug: "frustrations-early",
    title: "Frustrations raised early",
    description: "Small and early beats big and late.",
    sortOrder: 6,
    autoSource: null,
  },
]

/** Idempotent — keeps the six sheet rows present and ordered without
 *  disturbing any marks. Called on board load. */
export async function ensureStandingCommitments(): Promise<void> {
  for (const seed of STANDING_SEEDS) {
    await db.standingCommitment.upsert({
      where: { slug: seed.slug },
      create: seed,
      update: {
        title: seed.title,
        sortOrder: seed.sortOrder,
        autoSource: seed.autoSource,
        description: seed.description,
      },
    })
  }
}

// ─── Board (read model shared by admin + kiosk pages) ────────────────

export interface StandingCell {
  met: boolean | null
  note: string | null
  source: "manual" | "auto" | "none"
}

export interface StandingRow {
  id: string
  slug: string
  title: string
  description: string | null
  autoSource: string | null
  /// weekStart (YYYY-MM-DD) → cell
  cells: Record<string, StandingCell>
}

export interface OneOffRow {
  id: string
  promise: string
  saidBy: CommitmentParty
  agreedOn: string
  dueOn: string
  doneOn: string | null
  newDueOn: string | null
  missedReason: string | null
  status: OneOffStatus
}

export interface MeetingActionRow {
  id: string
  action: string
  owner: string
  agreedOn: string
  dueOn: string
  doneOn: string | null
  sourceTag: string
  status: OneOffStatus
}

export interface CommitmentPhotoRow {
  id: string
  weekStart: string
  kind: string
  url: string
  caption: string | null
  uploadedBy: string | null
  uploadedAt: string
}

export interface CommitmentsBoard {
  todayYmd: string
  currentWeekStart: string
  /// Newest first, capped, back to the July 2026 reset meeting.
  weeks: string[]
  standing: StandingRow[]
  oneOffs: OneOffRow[]
  /// Grouped client-side by sourceTag; newest meeting first.
  meetingActions: MeetingActionRow[]
  photos: CommitmentPhotoRow[]
}

const STATUS_ORDER: Record<OneOffStatus, number> = {
  overdue: 0,
  open: 1,
  done: 2,
}

export async function getCommitmentsBoard(params?: {
  maxWeeks?: number
}): Promise<CommitmentsBoard> {
  const weeks = boardWeekStarts(params?.maxWeeks ?? 12)
  const oldestWeek = weeks[weeks.length - 1]
  const today = ymd(todayAest())

  const [standing, marks, oneOffs, meetingActions, photos] = await Promise.all([
    db.standingCommitment.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.standingCommitmentMark.findMany({
      where: { weekStart: { gte: new Date(oldestWeek) } },
    }),
    db.oneOffCommitment.findMany({ orderBy: { dueOn: "asc" } }),
    db.meetingAction.findMany({
      orderBy: [{ agreedOn: "desc" }, { dueOn: "asc" }],
    }),
    db.commitmentWeekPhoto.findMany({
      orderBy: { uploadedAt: "desc" },
      take: 60,
    }),
  ])

  const rows: StandingRow[] = []
  for (const c of standing) {
    const cells: Record<string, StandingCell> = {}
    for (const week of weeks) {
      const manual = marks.find(
        (m) => m.commitmentId === c.id && ymd(m.weekStart) === week
      )
      if (manual) {
        cells[week] = { met: manual.met, note: manual.note, source: "manual" }
        continue
      }
      const auto = c.autoSource ? AUTO_SOURCES[c.autoSource] : undefined
      if (auto) {
        const derived = await auto(week)
        cells[week] = {
          met: derived.met,
          note: derived.detail,
          source: derived.met === null && !derived.detail ? "none" : "auto",
        }
      } else {
        cells[week] = { met: null, note: null, source: "none" }
      }
    }
    rows.push({
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      autoSource: c.autoSource,
      cells,
    })
  }

  const oneOffRows: OneOffRow[] = oneOffs
    .map((o) => ({
      id: o.id,
      promise: o.promise,
      saidBy: o.saidBy,
      agreedOn: ymd(o.agreedOn),
      dueOn: ymd(o.dueOn),
      doneOn: o.doneOn ? ymd(o.doneOn) : null,
      newDueOn: o.newDueOn ? ymd(o.newDueOn) : null,
      missedReason: o.missedReason,
      status: oneOffStatus(
        {
          dueOn: ymd(o.dueOn),
          newDueOn: o.newDueOn ? ymd(o.newDueOn) : null,
          doneOn: o.doneOn ? ymd(o.doneOn) : null,
        },
        today
      ),
    }))
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const meetingActionRows: MeetingActionRow[] = meetingActions.map((a) => ({
    id: a.id,
    action: a.action,
    owner: a.owner,
    agreedOn: ymd(a.agreedOn),
    dueOn: ymd(a.dueOn),
    doneOn: a.doneOn ? ymd(a.doneOn) : null,
    sourceTag: a.sourceTag,
    status: oneOffStatus(
      {
        dueOn: ymd(a.dueOn),
        newDueOn: null,
        doneOn: a.doneOn ? ymd(a.doneOn) : null,
      },
      today
    ),
  }))

  return {
    todayYmd: today,
    currentWeekStart: currentWeekStart(),
    weeks,
    standing: rows,
    oneOffs: oneOffRows,
    meetingActions: meetingActionRows,
    photos: photos.map((p) => ({
      id: p.id,
      weekStart: ymd(p.weekStart),
      kind: p.kind,
      url: p.url,
      caption: p.caption,
      uploadedBy: p.uploadedBy,
      uploadedAt: p.uploadedAt.toISOString(),
    })),
  }
}

// ─── Mutations ───────────────────────────────────────────────────────

function revalidateCommitments() {
  revalidatePath("/commitments")
  revalidatePath("/kitchen/commitments")
  revalidatePath("/kitchen/commitments/photos")
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/

function parseYmd(value: string, field: string): Date {
  if (!YMD_RE.test(value)) throw new Error(`Invalid ${field} date`)
  return new Date(value)
}

export async function setStandingMark(params: {
  commitmentId: string
  weekStart: string
  met: boolean
  note?: string | null
  markedBy?: string | null
}): Promise<void> {
  const weekStart = parseYmd(params.weekStart, "weekStart")
  const note = params.note?.trim() || null
  await db.standingCommitmentMark.upsert({
    where: {
      commitmentId_weekStart: {
        commitmentId: params.commitmentId,
        weekStart,
      },
    },
    create: {
      commitmentId: params.commitmentId,
      weekStart,
      met: params.met,
      note,
      markedBy: params.markedBy ?? "Chloe",
    },
    update: { met: params.met, note, markedBy: params.markedBy ?? "Chloe" },
  })
  revalidateCommitments()
}

/** Remove a manual mark — an auto-sourced commitment falls back to its
 *  derived value, a manual one back to unmarked. */
export async function clearStandingMark(params: {
  commitmentId: string
  weekStart: string
}): Promise<void> {
  await db.standingCommitmentMark.deleteMany({
    where: {
      commitmentId: params.commitmentId,
      weekStart: parseYmd(params.weekStart, "weekStart"),
    },
  })
  revalidateCommitments()
}

export async function createOneOff(params: {
  promise: string
  saidBy: CommitmentParty
  agreedOn: string
  dueOn: string
}): Promise<void> {
  const promise = params.promise.trim()
  if (!promise) throw new Error("Promise text is required")
  await db.oneOffCommitment.create({
    data: {
      promise,
      saidBy: params.saidBy,
      agreedOn: parseYmd(params.agreedOn, "agreedOn"),
      dueOn: parseYmd(params.dueOn, "dueOn"),
    },
  })
  revalidateCommitments()
}

export async function updateOneOff(params: {
  id: string
  promise?: string
  saidBy?: CommitmentParty
  agreedOn?: string
  dueOn?: string
}): Promise<void> {
  const data: Record<string, unknown> = {}
  if (params.promise !== undefined) {
    const promise = params.promise.trim()
    if (!promise) throw new Error("Promise text is required")
    data.promise = promise
  }
  if (params.saidBy !== undefined) data.saidBy = params.saidBy
  if (params.agreedOn !== undefined)
    data.agreedOn = parseYmd(params.agreedOn, "agreedOn")
  if (params.dueOn !== undefined) data.dueOn = parseYmd(params.dueOn, "dueOn")
  await db.oneOffCommitment.update({ where: { id: params.id }, data })
  revalidateCommitments()
}

export async function markOneOffDone(params: {
  id: string
  doneOn?: string
}): Promise<void> {
  await db.oneOffCommitment.update({
    where: { id: params.id },
    data: {
      doneOn: params.doneOn
        ? parseYmd(params.doneOn, "doneOn")
        : todayAest(),
    },
  })
  revalidateCommitments()
}

export async function reopenOneOff(params: { id: string }): Promise<void> {
  await db.oneOffCommitment.update({
    where: { id: params.id },
    data: { doneOn: null },
  })
  revalidateCommitments()
}

/** Missed the date: record the renegotiated date + why, per the sheet's
 *  "if missed: new date + why" columns. */
export async function rescheduleOneOff(params: {
  id: string
  newDueOn: string
  missedReason: string
}): Promise<void> {
  const missedReason = params.missedReason.trim()
  if (!missedReason) throw new Error("A reason is required when moving a date")
  await db.oneOffCommitment.update({
    where: { id: params.id },
    data: {
      newDueOn: parseYmd(params.newDueOn, "newDueOn"),
      missedReason,
    },
  })
  revalidateCommitments()
}

export async function deleteOneOff(params: { id: string }): Promise<void> {
  await db.oneOffCommitment.delete({ where: { id: params.id } })
  revalidateCommitments()
}

// ─── Meeting actions ─────────────────────────────────────────────────

export async function createMeetingAction(params: {
  action: string
  owner: string
  agreedOn: string
  dueOn: string
  sourceTag: string
}): Promise<void> {
  const action = params.action.trim()
  const owner = params.owner.trim()
  const sourceTag = params.sourceTag.trim()
  if (!action) throw new Error("Action text is required")
  if (!owner) throw new Error("An owner is required")
  if (!sourceTag) throw new Error("A meeting tag is required")
  await db.meetingAction.create({
    data: {
      action,
      owner,
      sourceTag,
      agreedOn: parseYmd(params.agreedOn, "agreedOn"),
      dueOn: parseYmd(params.dueOn, "dueOn"),
    },
  })
  revalidateCommitments()
}

export async function updateMeetingAction(params: {
  id: string
  action?: string
  owner?: string
  agreedOn?: string
  dueOn?: string
  sourceTag?: string
}): Promise<void> {
  const data: Record<string, unknown> = {}
  if (params.action !== undefined) {
    const action = params.action.trim()
    if (!action) throw new Error("Action text is required")
    data.action = action
  }
  if (params.owner !== undefined) {
    const owner = params.owner.trim()
    if (!owner) throw new Error("An owner is required")
    data.owner = owner
  }
  if (params.sourceTag !== undefined) {
    const sourceTag = params.sourceTag.trim()
    if (!sourceTag) throw new Error("A meeting tag is required")
    data.sourceTag = sourceTag
  }
  if (params.agreedOn !== undefined)
    data.agreedOn = parseYmd(params.agreedOn, "agreedOn")
  if (params.dueOn !== undefined) data.dueOn = parseYmd(params.dueOn, "dueOn")
  await db.meetingAction.update({ where: { id: params.id }, data })
  revalidateCommitments()
}

export async function markMeetingActionDone(params: {
  id: string
  doneOn?: string
}): Promise<void> {
  await db.meetingAction.update({
    where: { id: params.id },
    data: {
      doneOn: params.doneOn ? parseYmd(params.doneOn, "doneOn") : todayAest(),
    },
  })
  revalidateCommitments()
}

export async function reopenMeetingAction(params: { id: string }): Promise<void> {
  await db.meetingAction.update({
    where: { id: params.id },
    data: { doneOn: null },
  })
  revalidateCommitments()
}

export async function deleteMeetingAction(params: { id: string }): Promise<void> {
  await db.meetingAction.delete({ where: { id: params.id } })
  revalidateCommitments()
}

// ─── Paper-sheet photos ──────────────────────────────────────────────

export async function saveCommitmentPhoto(params: {
  weekStart: string
  kind: string
  url: string
  publicId: string
  caption?: string | null
  uploadedBy?: string | null
}): Promise<void> {
  await db.commitmentWeekPhoto.create({
    data: {
      weekStart: parseYmd(params.weekStart, "weekStart"),
      kind: params.kind,
      url: params.url,
      publicId: params.publicId,
      caption: params.caption?.trim() || null,
      uploadedBy: params.uploadedBy?.trim() || null,
    },
  })
  revalidateCommitments()
}

export async function deleteCommitmentPhoto(params: {
  photoId: string
}): Promise<void> {
  await db.commitmentWeekPhoto.deleteMany({ where: { id: params.photoId } })
  revalidateCommitments()
}
