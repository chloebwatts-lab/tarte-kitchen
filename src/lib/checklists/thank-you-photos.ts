import { db } from "@/lib/db"
import type { Venue } from "@/generated/prisma/client"
import { photoPool, pickOne, thankYouDisplayUrl } from "@/lib/checklists/thank-you"

/**
 * Server read for the checklist run page: one random staff photo for the
 * "Thank you :)" page. The venue's own photos first, else any venue's; null
 * only when there are no photos at all (then the finishing page does not
 * show). Never throws: a photo is a nice-to-have and must not break a
 * checklist.
 */
export async function pickThankYouPhotoUrl(venue: Venue): Promise<string | null> {
  try {
    const rows = await db.thankYouPhoto.findMany({
      where: { archived: false },
      select: { url: true, venue: true },
    })
    const url = pickOne(photoPool(rows, venue))?.url
    return url ? thankYouDisplayUrl(url) : null
  } catch {
    return null
  }
}
