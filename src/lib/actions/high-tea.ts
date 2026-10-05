"use server"

import { revalidatePath } from "next/cache"
import { db } from "@/lib/db"
import { getPerson } from "@/lib/person-session"

/**
 * The day-before check on one booking: how many guests are having the full
 * high tea. null clears the check, so the list goes back to everyone booked.
 */
export async function setHighTeaCheck(bookingRef: string, highTeaPax: number | null): Promise<void> {
  if (!bookingRef) return
  if (highTeaPax === null) {
    await db.highTeaBookingCheck.deleteMany({ where: { bookingRef } })
  } else {
    const pax = Math.max(0, Math.min(200, Math.round(highTeaPax)))
    const person = await getPerson()
    const checkedBy = person?.name ?? "Office"
    await db.highTeaBookingCheck.upsert({
      where: { bookingRef },
      create: { bookingRef, highTeaPax: pax, checkedBy },
      update: { highTeaPax: pax, checkedBy, checkedAt: new Date() },
    })
  }
  revalidatePath("/kitchen/high-tea")
}
