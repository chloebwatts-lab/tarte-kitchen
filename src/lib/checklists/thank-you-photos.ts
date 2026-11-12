import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { pickOne } from "@/lib/checklists/thank-you"

/**
 * Server read for the checklist run page: one random staff photo for the
 * venue's "Thank you :)" page, or null when the venue has none yet (then the
 * finishing page does not show). Never throws: a photo is a nice-to-have and
 * must not break a checklist.
 */
export async function pickThankYouPhotoUrl(venue: Venue): Promise<string | null> {
  try {
    const rows = await db.thankYouPhoto.findMany({
      where: { venue, archived: false },
      select: { url: true },
    })
    return pickOne(rows)?.url ?? null
  } catch {
    return null
  }
}
