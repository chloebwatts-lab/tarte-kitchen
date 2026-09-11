"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import { Venue, MeetingItemStatus } from "@/generated/prisma/client"

// ------------------------------------------------------------------
// The management meeting agenda. Quarterly, third Friday, Beach House.
//
// The standing agenda (what's working and what isn't, public holidays, menu
// changes, welfare, what Chloe and Shawna need from the team and back) is
// fixed and lives on the calendar invite. This is everything else: the queue
// anyone can add to between meetings so that raising something does not
// depend on remembering it on the day.
// ------------------------------------------------------------------

export interface AgendaItem {
  id: string
  topic: string
  detail: string | null
  raisedBy: string | null
  venue: Venue | null
  status: MeetingItemStatus
  outcome: string | null
  ageDays: number
  createdAt: string
}

export interface AgendaBoard {
  /// Queued for the next meeting. This is the agenda.
  open: AgendaItem[]
  /// Discussed, with what was decided. Kept visible so people can see that
  /// raising something led somewhere.
  recentlyClosed: AgendaItem[]
}

function toItem(r: {
  id: string
  topic: string
  detail: string | null
  raisedBy: string | null
  venue: Venue | null
  status: MeetingItemStatus
  outcome: string | null
  createdAt: Date
}): AgendaItem {
  return {
    id: r.id,
    topic: r.topic,
    detail: r.detail,
    raisedBy: r.raisedBy,
    venue: r.venue,
    status: r.status,
    outcome: r.outcome,
    ageDays: Math.floor((Date.now() - r.createdAt.getTime()) / 86400000),
    createdAt: r.createdAt.toISOString(),
  }
}

export async function getAgenda(): Promise<AgendaBoard> {
  const [open, closed] = await Promise.all([
    db.meetingAgendaItem.findMany({
      where: { status: "OPEN" },
      orderBy: { createdAt: "asc" },
    }),
    db.meetingAgendaItem.findMany({
      where: { status: { in: ["DISCUSSED", "DROPPED"] } },
      orderBy: { discussedAt: "desc" },
      take: 20,
    }),
  ])
  return { open: open.map(toItem), recentlyClosed: closed.map(toItem) }
}

export interface AddAgendaItemInput {
  topic: string
  detail?: string
  raisedBy?: string
  venue?: Venue
}

/** Anyone can add. No approval step, that would defeat the point. */
export async function addAgendaItem(input: AddAgendaItemInput) {
  const topic = input.topic.trim()
  if (!topic) throw new Error("Say what you want raised")
  const item = await db.meetingAgendaItem.create({
    data: {
      topic,
      detail: input.detail?.trim() || null,
      raisedBy: input.raisedBy?.trim() || null,
      venue: input.venue ?? null,
    },
  })
  revalidatePath("/meetings")
  revalidatePath("/kitchen/raise")
  return { id: item.id }
}

/**
 * Close an item off with what was decided. An outcome is required for
 * DISCUSSED: an item that vanishes with no recorded answer is the exact
 * thing this list exists to prevent.
 */
export async function closeAgendaItem(
  id: string,
  status: "DISCUSSED" | "DROPPED",
  outcome: string
) {
  const text = outcome.trim()
  if (status === "DISCUSSED" && !text) {
    throw new Error("Record what was decided before closing it")
  }
  await db.meetingAgendaItem.update({
    where: { id },
    data: { status, outcome: text || null, discussedAt: new Date() },
  })
  revalidatePath("/meetings")
}

/**
 * An action agreed in the room, onto the existing MeetingAction table so it
 * sits with the kitchen catch-up actions and inherits their overdue logic.
 */
export async function addMeetingAction(input: {
  action: string
  owner: string
  dueOn: Date
  meetingDate: Date
}) {
  const action = input.action.trim()
  if (!action) throw new Error("Say what the action is")
  if (!input.owner.trim()) throw new Error("Every action needs an owner")
  await db.meetingAction.create({
    data: {
      action,
      owner: input.owner.trim(),
      agreedOn: input.meetingDate,
      dueOn: input.dueOn,
      sourceTag: `Management ${input.meetingDate.toISOString().slice(0, 10)}`,
    },
  })
  revalidatePath("/meetings")
  revalidatePath("/commitments")
}
