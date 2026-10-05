import { db } from "@/lib/db"
import { Prisma } from "@/generated/prisma/client"
import {
  buildHighTeaDay,
  type HighTeaBooking,
  type HighTeaDay,
  type HighTeaStage,
  type SnapshotItem,
  type StandItem,
} from "./prep"

interface NbiRow {
  booking_ref: string
  booking_time: string
  pax: number
  first_name: string | null
  last_name: string | null
  status: string
  notes: string | null
  tags: string | null
}

/**
 * High tea bookings for a day, straight from the Now Book It rows Tarte
 * Inbox keeps in this database (inbox_nbi_bookings). Empty when that table
 * is missing, so the page still opens.
 */
export async function highTeaBookings(day: string): Promise<HighTeaBooking[]> {
  let rows: NbiRow[]
  try {
    rows = await db.$queryRaw<NbiRow[]>(Prisma.sql`
      SELECT booking_ref, booking_time::text, pax, first_name, last_name, status, notes, tags
        FROM inbox_nbi_bookings
       WHERE booking_date = ${day}::date AND service ILIKE '%high tea%'`)
  } catch {
    return []
  }
  return rows.map((r) => ({
    ref: r.booking_ref,
    time: r.booking_time.slice(0, 5),
    pax: Number(r.pax) || 0,
    name: [r.first_name, r.last_name].filter(Boolean).join(" ") || "No name",
    status: r.status,
    notes: r.notes?.trim() || null,
    tags: r.tags?.trim() || null,
  }))
}

export async function standItems(): Promise<StandItem[]> {
  const items = await db.highTeaStandItem.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  })
  return items.map((i) => ({ name: i.name, perGuest: Number(i.perGuest) }))
}

export async function getHighTeaDay(day: string): Promise<HighTeaDay> {
  const [bookings, items] = await Promise.all([highTeaBookings(day), standItems()])
  const checks = bookings.length
    ? await db.highTeaBookingCheck.findMany({ where: { bookingRef: { in: bookings.map((b) => b.ref) } } })
    : []
  return buildHighTeaDay(day, bookings, new Map(checks.map((c) => [c.bookingRef, c.highTeaPax])), items)
}

export interface Snapshot {
  stage: HighTeaStage
  guests: number
  items: SnapshotItem[]
  createdAt: Date
}

export async function snapshotsFor(day: string): Promise<Snapshot[]> {
  const rows = await db.highTeaPrepSnapshot.findMany({
    where: { serviceDate: new Date(`${day}T00:00:00Z`) },
    orderBy: { createdAt: "asc" },
  })
  return rows.map((r) => ({
    stage: r.stage as HighTeaStage,
    guests: r.guests,
    items: (r.items as unknown as SnapshotItem[]) ?? [],
    createdAt: r.createdAt,
  }))
}

/** Record the list as sent at this stage. A re-run of the same stage replaces it. */
export async function saveSnapshot(d: HighTeaDay, stage: HighTeaStage): Promise<void> {
  const serviceDate = new Date(`${d.day}T00:00:00Z`)
  const items = d.lines.map((l) => ({ name: l.name, total: l.total }))
  await db.highTeaPrepSnapshot.upsert({
    where: { serviceDate_stage: { serviceDate, stage } },
    create: { serviceDate, stage, guests: d.guests, bookedGuests: d.bookedGuests, items },
    update: { guests: d.guests, bookedGuests: d.bookedGuests, items, createdAt: new Date() },
  })
}
