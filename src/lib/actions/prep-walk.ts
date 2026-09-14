"use server"

import { db } from "@/lib/db"
import { revalidatePath } from "next/cache"
import type { PrepWalkStatus, Venue } from "@/generated/prisma/client"

// The prep walk-through's memory. The walk itself is fast tap-through with
// no typing; these calls run behind each tap so the progress is real:
// visible from any device, kept if the iPad's browser is cleared, and
// attributable to whoever was on prep.

export type PrepWalkStatuses = Record<string, PrepWalkStatus>

const day = (forDate: string) => forDate.slice(0, 10)

/** Everything ticked for this venue and service day, keyed by preparation. */
export async function getPrepWalkTicks(
  venue: Venue,
  forDate: string
): Promise<PrepWalkStatuses> {
  const rows = await db.prepWalkTick.findMany({
    where: { venue, forDate: day(forDate) },
    select: { preparationId: true, status: true },
  })
  return Object.fromEntries(rows.map((r) => [r.preparationId, r.status]))
}

/** One tap: made it, or skipped it. A second tap on the same prep updates. */
export async function setPrepWalkTick(input: {
  venue: Venue
  forDate: string
  preparationId: string
  status: PrepWalkStatus
  by?: string
}) {
  const by = input.by?.trim() || null
  await db.prepWalkTick.upsert({
    where: {
      venue_forDate_preparationId: {
        venue: input.venue,
        forDate: day(input.forDate),
        preparationId: input.preparationId,
      },
    },
    create: {
      venue: input.venue,
      forDate: day(input.forDate),
      preparationId: input.preparationId,
      status: input.status,
      by,
    },
    update: { status: input.status, by, at: new Date() },
  })
  revalidatePath("/kitchen/prep")
}

/** "Undo last": the tap was a slip, take it back. */
export async function clearPrepWalkTick(input: {
  venue: Venue
  forDate: string
  preparationId: string
}) {
  await db.prepWalkTick.deleteMany({
    where: {
      venue: input.venue,
      forDate: day(input.forDate),
      preparationId: input.preparationId,
    },
  })
  revalidatePath("/kitchen/prep")
}

/** "Run again": start the day's walk from the top. */
export async function resetPrepWalk(venue: Venue, forDate: string) {
  await db.prepWalkTick.deleteMany({ where: { venue, forDate: day(forDate) } })
  revalidatePath("/kitchen/prep")
}
